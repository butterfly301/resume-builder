import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { chromium } from 'playwright-core'
import { ZodError } from 'zod'
import {
  resumeSchema,
  type ResumeDocument,
} from '../src/shared/resume.js'
const rootDir = process.cwd()
const dataDir = path.join(rootDir, 'data', 'resumes')
const exportDir = path.join(rootDir, 'exports')
const distDir = path.join(rootDir, 'dist')
const port = Number.parseInt(process.env.PORT ?? '4178', 10)
const host = '127.0.0.1'

class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message)
  }
}

const app = express()
app.disable('x-powered-by')
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }))
app.use(express.json({ limit: '8mb' }))
app.use((req, res, next) => {
  const requestId = req.header('x-request-id') ?? crypto.randomUUID()
  res.setHeader('x-request-id', requestId)
  const startedAt = Date.now()
  res.on('finish', () => {
    process.stdout.write(
      `${JSON.stringify({ level: 'info', requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - startedAt })}\n`,
    )
  })
  next()
})

function resumeFileName(id: string) {
  return `${safeFilePart(id)}.json`
}

async function readResumes(): Promise<ResumeDocument[]> {
  let names: string[] = []
  try {
    names = (await fs.readdir(dataDir)).filter((name) => name.endsWith('.json') && !name.endsWith('.tmp'))
  } catch {
    return []
  }
  names.sort((a, b) => a.localeCompare(b))
  const list: ResumeDocument[] = []
  for (const name of names) {
    const raw = await fs.readFile(path.join(dataDir, name), 'utf8')
    list.push(resumeSchema.parse(JSON.parse(raw)))
  }
  return list
}

async function writeResume(resume: ResumeDocument) {
  const parsed = resumeSchema.parse(resume)
  await fs.mkdir(dataDir, { recursive: true })
  const file = path.join(dataDir, resumeFileName(parsed.id))
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  await fs.rename(temporary, file)
}

function safeFilePart(value: string) {
  const forbidden = '<>:"/\\|?*'
  const cleaned = Array.from(value, (character) => character.charCodeAt(0) > 31 && !forbidden.includes(character) ? character : '').join('')
  return cleaned.trim() || '简历'
}

function findBrowserExecutable() {
  const candidates = [
    process.env.RESUME_BROWSER_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean) as string[]
  return candidates
}

async function firstExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // Continue to the next configured browser.
    }
  }
  throw new AppError('未找到 Edge 或 Chrome，无法生成 PDF。', 'BROWSER_NOT_FOUND', 503)
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/ready', async (_req, res, next) => {
  try {
    await fs.access(dataDir)
    res.json({ status: 'ok', dataDir })
  } catch (error) {
    next(error)
  }
})

app.get('/api/resumes', async (_req, res, next) => {
  try {
    res.json(await readResumes())
  } catch (error) {
    next(error)
  }
})

app.post('/api/resumes', async (req, res, next) => {
  try {
    const input = resumeSchema.parse(req.body)
    const existing = await readResumes()
    if (existing.some((resume) => resume.id === input.id)) {
      throw new AppError('该简历标识已存在。', 'RESUME_EXISTS', 409)
    }
    await writeResume(input)
    res.status(201).json(input)
  } catch (error) {
    next(error)
  }
})

app.put('/api/resumes/:id', async (req, res, next) => {
  try {
    const input = resumeSchema.parse(req.body)
    if (input.id !== req.params.id) {
      throw new AppError('请求地址与简历标识不一致。', 'ID_MISMATCH', 422)
    }
    const existing = await readResumes()
    const index = existing.findIndex((resume) => resume.id === req.params.id)
    if (index < 0) {
      throw new AppError('找不到这份简历。', 'RESUME_NOT_FOUND', 404)
    }
    const updated = { ...input, updatedAt: new Date().toISOString() }
    await writeResume(updated)
    res.json(updated)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/resumes/:id', async (req, res, next) => {
  try {
    const existing = await readResumes()
    const index = existing.findIndex((resume) => resume.id === req.params.id)
    if (index < 0) {
      throw new AppError('找不到这份简历。', 'RESUME_NOT_FOUND', 404)
    }
    const [removed] = existing.splice(index, 1)
    await fs.unlink(path.join(dataDir, resumeFileName(req.params.id))).catch(() => {})
    res.json(removed)
  } catch (error) {
    next(error)
  }
})

app.post('/api/export/:id', async (req, res, next) => {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const resumes = await readResumes()
    const resume = resumes.find((item) => item.id === req.params.id)
    if (!resume) {
      throw new AppError('找不到要导出的简历。', 'RESUME_NOT_FOUND', 404)
    }

    const executablePath = await firstExistingPath(findBrowserExecutable())
    browser = await chromium.launch({ executablePath, headless: true })
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 })
    await page.goto(`http://${host}:${port}/?print=1&resume=${encodeURIComponent(resume.id)}`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    })
    await page.waitForSelector('.resume-page', { timeout: 30_000 })
    await page.waitForSelector('[data-pagination-ready="true"]', { timeout: 30_000 })
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    await page.waitForTimeout(250)

    const renderedResumeId = await page.locator('[data-resume-id]').first().getAttribute('data-resume-id').catch(() => null)
    if (renderedResumeId !== resume.id) {
      throw new AppError('打印页面加载了错误的简历，请刷新后重试。', 'PRINT_RESUME_MISMATCH', 409)
    }
    const overflowCount = await page.locator('.resume-overflow, [data-overflow="true"]').count()
    if (overflowCount > 0) {
      throw new AppError('存在超过一页的经历条目，请精简后再导出。', 'RESUME_OVERFLOW', 422)
    }

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    const outputName = `${safeFilePart(resume.person.name)}-${safeFilePart(resume.person.role)}-${safeFilePart(resume.person.phone)}.pdf`
    await fs.mkdir(exportDir, { recursive: true })
    await fs.writeFile(path.join(exportDir, outputName), pdf)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(outputName)}`)
    res.send(pdf)
  } catch (error) {
    next(error)
  } finally {
    await browser?.close()
  }
})

app.use(express.static(distDir, { extensions: ['html'] }))
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(distDir, 'index.html'), (error) => {
      if (error) next(error)
    })
    return
  }
  next(new AppError('请求地址不存在。', 'NOT_FOUND', 404))
})

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = res.getHeader('x-request-id')
  if (error instanceof ZodError) {
    res.status(422).json({
      code: 'VALIDATION_ERROR',
      message: '提交的数据格式不正确。',
      issues: error.issues,
      requestId,
    })
    return
  }
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ code: error.code, message: error.message, requestId })
    return
  }
  const details = error instanceof Error ? { message: error.message, stack: error.stack } : { value: error }
  process.stderr.write(`${JSON.stringify({ level: 'error', requestId, path: req.path, ...details })}\n`)
  res.status(500).json({ code: 'INTERNAL_ERROR', message: '本地服务处理失败，请查看启动窗口。', requestId })
})

const server = app.listen(port, host, () => {
  const url = `http://${host}:${port}`
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'server_started', url })}\n`)
  if (process.env.AUTO_OPEN === '1') {
    const child = spawn('cmd.exe', ['/c', 'start', 'msedge', url], { detached: true, stdio: 'ignore' })
    child.unref()
  }
})

function shutdown(signal: string) {
  process.stdout.write(`${JSON.stringify({ level: 'info', event: 'shutdown', signal })}\n`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
