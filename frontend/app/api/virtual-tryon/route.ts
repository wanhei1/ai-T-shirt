import { NextResponse, type NextRequest } from "next/server"

import { SimpleComfyUIClient } from "@/lib/simple-comfyui-client"

function getEnvString(key: string, fallback: string): string {
	const value = process.env[key]
	return (value && value.trim()) || fallback
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

function buildCatVtonWorkflow(params: {
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

	// Node ids are kept aligned with the workflow you provided for easier debugging.
	return {
		"10": {
			class_type: "LoadImage",
			inputs: {
				image: personFilename,
			},
		},
		"11": {
			class_type: "LoadImage",
			inputs: {
				image: clothFilename,
			},
		},
		"12": {
			class_type: "LoadAutoMasker",
			inputs: {
				catvton_path: catvtonPath,
			},
		},
		"13": {
			class_type: "AutoMasker",
			inputs: {
				pipe: ["12", 0],
				target_image: ["10", 0],
				cloth_type: clothType,
			},
		},
		"17": {
			class_type: "LoadCatVTONPipeline",
			inputs: {
				sd15_inpaint_path: sd15InpaintPath,
				catvton_path: catvtonPath,
				mixed_precision: mixedPrecision,
				vae_path: vaePath,
			},
		},
		"16": {
			class_type: "CatVTON",
			inputs: {
				pipe: ["17", 0],
				target_image: ["10", 0],
				refer_image: ["11", 0],
				mask_image: ["13", 0],
				seed,
				steps,
				cfg,
			},
		},
		"25": {
			class_type: "SaveImage",
			inputs: {
				filename_prefix: filenamePrefix,
				images: ["16", 0],
			},
		},
	}
}

export async function POST(request: NextRequest) {
	try {
		const form = await request.formData()
		const person = requireFile(form.get("person"), "person")
		const cloth = requireFile(form.get("cloth"), "cloth")

		// Prefer a single, stable ComfyUI instance by default.
		// If you run multiple instances (e.g. 8188/8189) with different models/custom nodes,
		// results can vary even with the same inputs.
		const comfyUrl = getEnvString("COMFYUI_URL", "http://127.0.0.1:8188")
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

		const catvtonPath = getEnvString("CATVTON_PATH", "zhengchong/CatVTON")
		// Use the model you specified. You can still override via SD15_INPAINT_PATH.
		const sd15InpaintPath = getEnvString("SD15_INPAINT_PATH", "runwayml/stable-diffusion-inpainting")
		const vaePath = getEnvString("SD_VAE_PATH", "stabilityai/sd-vae-ft-mse")

		const workflow = buildCatVtonWorkflow({
			personFilename,
			clothFilename,
			catvtonPath,
			sd15InpaintPath,
			vaePath,
			mixedPrecision: "bf16",
			clothType: "upper",
			seed: 42,
			steps: 50,
			cfg: 2.8,
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
			debug: {
				inputs: { person: personFilename, cloth: clothFilename },
				params: {
					catvtonPath,
					sd15InpaintPath,
					vaePath,
					mixedPrecision: "bf16",
					clothType: "upper",
					seed: 42,
					steps: 50,
					cfg: 2.5,
				},
			},
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
