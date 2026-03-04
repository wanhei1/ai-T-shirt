import { NextResponse, type NextRequest } from "next/server"

const apiUrlsString = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8185"
const potentialApiUrls = apiUrlsString
	.split(",")
	.map((url) => url.trim())
	.filter(Boolean)

let determinedApiBaseUrl: string | null = null

async function findAvailableApiBaseUrl(): Promise<string> {
	if (determinedApiBaseUrl) {
		return determinedApiBaseUrl
	}

	for (const baseUrl of potentialApiUrls) {
		try {
			const healthUrl = new URL("/health", baseUrl).toString()
			const response = await fetch(healthUrl, {
				method: "GET",
				signal: AbortSignal.timeout(3000),
				cache: "no-store",
			})
			if (response.ok) {
				determinedApiBaseUrl = baseUrl
				return baseUrl
			}
		} catch {
			// try next
		}
	}

	determinedApiBaseUrl = potentialApiUrls[0] || "http://localhost:8185"
	return determinedApiBaseUrl
}

function requireFile(value: FormDataEntryValue | null, field: string): File {
	if (!value || typeof value === "string") {
		throw new Error(`Missing file field: ${field}`)
	}
	return value
}

async function fileToDataUrl(file: File): Promise<string> {
	const buffer = Buffer.from(await file.arrayBuffer())
	const mime = file.type || "image/png"
	return `data:${mime};base64,${buffer.toString("base64")}`
}

function getBearerToken(request: NextRequest): string | null {
	const authHeader = request.headers.get("authorization") || request.headers.get("Authorization")
	if (!authHeader) return null
	const value = authHeader.trim()
	if (/^Bearer\s+/i.test(value)) {
		return value.replace(/^Bearer\s+/i, "")
	}
	return value || null
}

async function pollJobResult(baseUrl: string, queue: string, jobId: string | number, token: string | null): Promise<any> {
	const timeoutMs = Math.max(30_000, Number.parseInt(process.env.TRYON_JOB_TIMEOUT_MS || "600000", 10))
	const intervalMs = Math.max(500, Number.parseInt(process.env.TRYON_JOB_POLL_INTERVAL_MS || "1200", 10))
	const startedAt = Date.now()

	while (Date.now() - startedAt < timeoutMs) {
		const statusUrl = new URL(`/api/jobs/${encodeURIComponent(queue)}/${encodeURIComponent(String(jobId))}`, baseUrl).toString()
		const response = await fetch(statusUrl, {
			method: "GET",
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			cache: "no-store",
		})

		if (!response.ok) {
			const text = await response.text().catch(() => "")
			throw new Error(`获取任务状态失败: ${response.status} ${response.statusText} ${text}`)
		}

		const data = (await response.json().catch(() => null)) as { job?: any } | null
		const job = data?.job
		if (!job) {
			throw new Error("任务状态返回异常：缺少 job 字段")
		}

		if (job.state === "completed") {
			return job
		}

		if (job.state === "failed") {
			throw new Error(job.failedReason || "试穿任务执行失败")
		}

		await new Promise((resolve) => setTimeout(resolve, intervalMs))
	}

	throw new Error(`试穿任务超时（>${timeoutMs}ms）`)
}

export async function POST(request: NextRequest) {
	try {
		const form = await request.formData()
		const person = requireFile(form.get("person"), "person")
		const cloth = requireFile(form.get("cloth"), "cloth")

		const [personDataUrl, clothDataUrl] = await Promise.all([
			fileToDataUrl(person),
			fileToDataUrl(cloth),
		])

		const baseUrl = await findAvailableApiBaseUrl()
		const token = getBearerToken(request)

		const createJobUrl = new URL("/api/jobs", baseUrl).toString()
		const createResp = await fetch(createJobUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...(token ? { Authorization: `Bearer ${token}` } : {}),
			},
			body: JSON.stringify({
				type: "virtual-tryon",
				payload: {
					personDataUrl,
					clothDataUrl,
				},
			}),
		})

		if (!createResp.ok) {
			const text = await createResp.text().catch(() => "")
			return NextResponse.json(
				{ success: false, error: "创建试穿任务失败", details: `${createResp.status} ${createResp.statusText} ${text}` },
				{ status: createResp.status }
			)
		}

		const createData = (await createResp.json().catch(() => null)) as {
			jobId?: string | number
			queue?: string
			queueStats?: {
				waiting?: number
				active?: number
				completed?: number
				failed?: number
				delayed?: number
				paused?: number
			}
		} | null
		const jobId = createData?.jobId
		const queue = createData?.queue
		if (!jobId || !queue) {
			return NextResponse.json(
				{ success: false, error: "创建试穿任务失败", details: "返回缺少 jobId 或 queue" },
				{ status: 500 }
			)
		}

		const job = await pollJobResult(baseUrl, queue, jobId, token)
		const imageUrl = job?.result?.imageUrl
		if (!imageUrl) {
			return NextResponse.json(
				{ success: false, error: "试穿任务完成但无图像输出" },
				{ status: 500 }
			)
		}

		return NextResponse.json({
			success: true,
			imageUrl,
			jobId,
			queue,
			queueStats: createData?.queueStats ?? null,
			server: baseUrl,
			state: job.state,
			progress: job.progress,
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
