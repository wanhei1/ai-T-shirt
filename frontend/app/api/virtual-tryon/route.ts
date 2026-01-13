import { NextResponse, type NextRequest } from "next/server"

import { readFile } from "node:fs/promises"
import { access } from "node:fs/promises"
import path from "node:path"

import { SimpleComfyUIClient } from "@/lib/simple-comfyui-client"

function getEnvString(key: string, fallback: string): string {
	const value = process.env[key]
	return (value && value.trim()) || fallback
}

async function pathExists(p: string): Promise<boolean> {
	try {
		await access(p)
		return true
	} catch {
		return false
	}
}

async function resolveCatVtonModelPaths(): Promise<{
	catvtonPath: string
	sd15InpaintPath: string
	vaePath: string
}> {
	const envCatvton = (process.env.COMFYUI_CATVTON_PATH || process.env.CATVTON_PATH || "").trim()
	const envSd15 = (process.env.COMFYUI_SD15_INPAINT_PATH || process.env.SD15_INPAINT_PATH || "").trim()
	const envVae = (process.env.COMFYUI_SD_VAE_PATH || process.env.SD_VAE_PATH || "").trim()

	if (envCatvton && envSd15 && envVae) {
		return { catvtonPath: envCatvton, sd15InpaintPath: envSd15, vaePath: envVae }
	}

	// Prefer the monorepo-local ComfyUI models directory when running on the same machine.
	// `process.cwd()` can differ depending on how dev/build is launched (repo root vs frontend).
	const comfyRootCandidates = [
		path.resolve(process.cwd(), "..", "ComfyUI"),
		path.resolve(process.cwd(), "ComfyUI"),
	]
	let comfyRoot = comfyRootCandidates[0]
	for (const candidate of comfyRootCandidates) {
		if (await pathExists(candidate)) {
			comfyRoot = candidate
			break
		}
	}

	const localModelsRoot = path.join(comfyRoot, "models", "catvton")
	const localSd15 = path.join(localModelsRoot, "stable-diffusion-inpainting")
	const localVae = path.join(localModelsRoot, "sd-vae-ft-mse")

	const catvtonPath = envCatvton || ((await pathExists(localModelsRoot)) ? localModelsRoot : "zhengchong/CatVTON")
	const sd15InpaintPath = envSd15 || ((await pathExists(localSd15)) ? localSd15 : "runwayml/stable-diffusion-inpainting")
	const vaePath = envVae || ((await pathExists(localVae)) ? localVae : "stabilityai/sd-vae-ft-mse")

	return { catvtonPath, sd15InpaintPath, vaePath }
}

function requireFile(value: FormDataEntryValue | null, field: string): File {
	if (!value || typeof value === "string") {
		throw new Error(`Missing file field: ${field}`)
	}
	return value
}

async function uploadToComfyInput(baseUrl: string, file: File, filename: string): Promise<string> {
	const bytes = await file.arrayBuffer()
	const blob = new Blob([bytes], { type: file.type || "application/octet-stream" })

	const form = new FormData()
	form.append("image", blob, filename)
	form.append("type", "input")
	form.append("overwrite", "true")

	const resp = await fetch(`${baseUrl}/upload/image`, {
		method: "POST",
		body: form,
	})

	if (!resp.ok) {
		const text = await resp.text().catch(() => "")
		throw new Error(`ComfyUI upload failed: ${resp.status} ${resp.statusText} ${text}`)
	}

	const json = (await resp.json().catch(() => null)) as { name?: string } | null
	if (!json?.name) {
		throw new Error("ComfyUI upload response missing filename")
	}

	return json.name
}

async function loadCatVtonWorkflowTemplate(): Promise<Record<string, any>> {
	// The workflow template lives in the Next.js project so it can be deployed with the frontend.
	const candidates = [
		path.join(process.cwd(), "workflows", "catvton_workflow.json"),
		path.join(process.cwd(), "frontend", "workflows", "catvton_workflow.json"),
	]
	let workflowPath = candidates[0]
	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			workflowPath = candidate
			break
		}
	}

	const raw = await readFile(workflowPath, "utf-8")
	const json = JSON.parse(raw) as Record<string, any>
	return json
}

function patchCatVtonWorkflow(params: {
	workflow: Record<string, any>
	personFilename: string
	clothFilename: string
	catvtonPath: string
	sd15InpaintPath: string
	vaePath: string
	mixedPrecision: "fp32" | "fp16" | "bf16"
	clothType: "upper" | "lower" | "overall"
	seed: number
	steps: number
	cfg: number
	filenamePrefix: string
}): Record<string, unknown> {
	const {
		workflow,
		personFilename,
		clothFilename,
		catvtonPath,
		sd15InpaintPath,
		vaePath,
		mixedPrecision,
		clothType,
		seed,
		steps,
		cfg,
		filenamePrefix,
	} = params

	// This patcher expects the workflow template to use the same node ids as our template.
	if (!workflow["10"]?.inputs || !workflow["11"]?.inputs || !workflow["25"]?.inputs) {
		throw new Error("catvton_workflow.json 格式不符合预期（缺少关键节点 10/11/25）")
	}

	workflow["10"].inputs.image = personFilename
	workflow["11"].inputs.image = clothFilename

	if (workflow["12"]?.inputs) {
		workflow["12"].inputs.catvton_path = catvtonPath
	}
	if (workflow["17"]?.inputs) {
		workflow["17"].inputs.sd15_inpaint_path = sd15InpaintPath
		workflow["17"].inputs.catvton_path = catvtonPath
		workflow["17"].inputs.mixed_precision = mixedPrecision
		workflow["17"].inputs.vae_path = vaePath
	}
	if (workflow["13"]?.inputs) {
		workflow["13"].inputs.cloth_type = clothType
	}
	if (workflow["16"]?.inputs) {
		workflow["16"].inputs.seed = seed
		workflow["16"].inputs.steps = steps
		workflow["16"].inputs.cfg = cfg
	}
	workflow["25"].inputs.filename_prefix = filenamePrefix

	return workflow
}

export async function POST(request: NextRequest) {
	try {
		const form = await request.formData()
		const person = requireFile(form.get("person"), "person")
		const cloth = requireFile(form.get("cloth"), "cloth")

		const comfyUrl = getEnvString("COMFYUI_URL", "http://127.0.0.1:8189,http://127.0.0.1:8188")
		const client = new SimpleComfyUIClient(comfyUrl)

		const ok = await client.checkConnection()
		if (!ok) {
			return NextResponse.json(
				{ success: false, error: "ComfyUI 不可用", details: "无法连接到任何 ComfyUI 服务器" },
				{ status: 503 }
			)
		}

		const active = client.getActiveServerUrl()
		if (!active) {
			return NextResponse.json(
				{ success: false, error: "ComfyUI 不可用", details: "未找到可用的 ComfyUI 服务器" },
				{ status: 503 }
			)
		}

		const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
		const personName = `tryon-person-${suffix}.png`
		const clothName = `tryon-cloth-${suffix}.png`

		const [personFilename, clothFilename] = await Promise.all([
			uploadToComfyInput(active, person, personName),
			uploadToComfyInput(active, cloth, clothName),
		])

		const { catvtonPath, sd15InpaintPath, vaePath } = await resolveCatVtonModelPaths()
		console.log("[virtual-tryon] resolved paths", { catvtonPath, sd15InpaintPath, vaePath })

		const template = await loadCatVtonWorkflowTemplate()
		const workflow = patchCatVtonWorkflow({
			workflow: template,
			personFilename,
			clothFilename,
			catvtonPath,
			sd15InpaintPath,
			vaePath,
			mixedPrecision: "bf16",
			clothType: "overall",
			seed: 42,
			steps: 50,
			cfg: 2.5,
			filenamePrefix: "tryon",
		})

		const queued = await client.queuePrompt(workflow)
		const completed = await client.waitForCompletion(queued.prompt_id, 10 * 60 * 1000)
		const imageBuffer = await client.getImage(completed.filename, completed.subfolder, "output")

		const base64 = Buffer.from(imageBuffer).toString("base64")
		const imageUrl = `data:image/png;base64,${base64}`

		return NextResponse.json({
			success: true,
			imageUrl,
			promptId: queued.prompt_id,
			server: active,
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error"
		return NextResponse.json(
			{
				success: false,
				error: "试穿失败",
				details: message,
			},
			{ status: 500 }
		)
	}
}
