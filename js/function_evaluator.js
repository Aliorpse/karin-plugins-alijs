// 需要安装 qpdf 并且将它添加至环境变量中, 否则无法加密 pdf
// 需要额外添加的包: sharp crypto axios pdfkit

import sharp from 'sharp'
import crypto from 'crypto'
import axios from 'axios'
import fs from 'fs/promises'
import fss from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { execSync } from 'child_process'
import { karin, karinPathBase, logger } from 'node-karin'

const CONFIG = {
  CDN_ID: 'cdn-msp3',
  MAX_CONNECTIONS: 8,
  TIMEOUT: 10000
}

const baseUrl = `https://${CONFIG.CDN_ID}.18comic.vip/media/photos/`

function getScrambleNum(aid, pageStr) {
  aid = parseInt(aid, 10)
  if (aid < 220980) return 0
  if (aid < 268850) return 10
  const code = crypto.createHash('md5')
    .update(String(aid + pageStr))
    .digest('hex')
    .charCodeAt(31)
  const arraySize = aid < 421926 ? 10 : 8
  return Array.from({ length: arraySize }, (_, i) => (i + 1) * 2)[code % arraySize]
}

async function scrambleImageWebP(inputBuffer, aid, pageStr) {
  const image = sharp(inputBuffer)
  const splitCount = getScrambleNum(aid, pageStr)
  if (splitCount === 0) return image.jpeg({ quality: 90 }).toBuffer()

  const metadata = await image.metadata()
  const { width, height, channels } = metadata
  const partHeight = Math.floor(height / splitCount)
  const remainder = height % splitCount

  const parts = await Promise.all(
    Array.from({ length: splitCount }, (_, index) => {
      const partHeightAdjusted = index === 0 ? partHeight + remainder : partHeight
      const top = height - partHeight * (index + 1) - remainder
      return image.clone()
        .extract({ left: 0, top, width, height: partHeightAdjusted })
        .toBuffer()
    })
  )

  return sharp({
    create: {
      width,
      height,
      channels: channels || 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(parts.map((img, i) => ({
      input: img,
      top: i === 0 ? 0 : partHeight * i + remainder,
      left: 0
    })))
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function processImages(aid) {
  let currentPage = 1
  const results = []
  let stop = false
  let hasError = false

  const MAX_RETRIES = 3
  const nextPage = () => {
    if (stop) return null
    return currentPage++
  }

  const downloadAndProcess = async () => {
    while (true) {
      const pageNum = nextPage()
      if (pageNum === null) break

      const padded = String(pageNum).padStart(5, '0')
      const url = `${baseUrl}${aid}/${padded}.webp`

      let attempt = 0
      while (attempt < MAX_RETRIES) {
        attempt++
        try {
          const { data } = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: CONFIG.TIMEOUT
          })

          if (!data || data.byteLength === 0) {
            logger.error(`页面 ${pageNum} 空内容，停止下载`)
            stop = true
            return
          }

          const processed = await scrambleImageWebP(data, parseInt(aid, 10), padded)
          results.push({ pageNum, buffer: processed })
          break
        } catch (err) {
          if (err?.response?.status === 404) {
            logger.warn(`页面 ${pageNum} 404，停止下载`)
            stop = true
            return
          }
          logger.warn(`第${attempt}次尝试下载页面${pageNum}失败: ${err.message || err}`)
          if (attempt >= MAX_RETRIES) {
            logger.error(`页面 ${pageNum} 下载失败超过最大重试次数，停止整个流程`)
            hasError = true
            stop = true
            return
          }
          await new Promise(r => setTimeout(r, 500 * attempt))
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONFIG.MAX_CONNECTIONS }, () => downloadAndProcess())
  )

  if (hasError) throw new Error('图片下载失败，超过最大重试次数')

  return results.sort((a, b) => a.pageNum - b.pageNum)
}

async function createPdf(images, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, size: 'A4', margins: { top: 20, left: 20, right: 20, bottom: 20 } })
    const stream = fss.createWriteStream(outputPath)
    doc.pipe(stream)

    const pageWidth = 595.28
    const pageHeight = 841.89
    const contentWidth = pageWidth - 40
    const contentHeight = pageHeight - 40

    for (const { buffer } of images) {
      const img = doc.openImage(buffer)
      const scale = Math.min(contentWidth / img.width, contentHeight / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const x = (pageWidth - w) / 2
      const y = (pageHeight - h) / 2

      doc.addPage().image(img, x, y, { width: w, height: h })
    }

    doc.end()
    stream.on('finish', () => resolve(outputPath))
    stream.on('error', reject)
  })
}

async function encryptPdf(inputPath, outputPath, password) {
  try {
    execSync(`qpdf --encrypt "${password}" "${password}" 256 -- "${inputPath}" "${outputPath}"`)
    logger.info(`已加密 PDF: ${outputPath}`)
    await fs.unlink(inputPath)
    return outputPath
  } catch (err) {
    logger.error('PDF 加密失败:', err.message)
    throw err
  }
}

let isProcessing = false
const regex = /^(?:#|\/)?求导(\d*)$/

export const functionEvaluator = karin.command(regex, async (e) => {
  if (isProcessing) return e.reply('上一个任务还没完成呢~', { at: true })
  isProcessing = true

  const aid = e.msg.match(regex)[1].trim()
  if (!aid) return e.reply('你没有输入要导的数~')
  const { messageId } = await e.reply(`开始对 ${aid} 求导, 请稍后~`, { reply: true })

  try {
    const dir = path.join(karinPathBase, `/temp/function_evaluator`)
    await fs.mkdir(dir, { recursive: true })

    const rawPdf = path.join(dir, `jmc_${aid}_raw.pdf`)
    const encPdf = path.join(dir, `jmc_${aid}_encrypted.pdf`)

    if (await fs.stat(encPdf).then(() => true).catch(() => false)) {
      return await e.bot.uploadFile(e.contact, encPdf, `对 ${aid} 的求导过程.pdf`)
    }

    const imgs = await processImages(aid)

    if (imgs.length === 0) {
      return e.reply('我还不会求导它...问问别人吧?', { reply: true })
    }

    await createPdf(imgs, rawPdf)
    await encryptPdf(rawPdf, encPdf, aid)
    await e.bot.uploadFile(e.contact, encPdf, `对 ${aid} 的求导过程.pdf`)
  } catch (err) {
    logger.error('运行出错:', err.message || err)
    return e.reply('出错了，请查看控制台', { reply: true })
  } finally {
    isProcessing = false
    await e.bot.recallMsg(e.contact, messageId)
  }
})
