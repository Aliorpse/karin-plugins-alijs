// 需要安装 qpdf 并且将它添加至环境变量中, 否则无法加密 pdf
// 需要额外添加的包: sharp crypto axios pdfkit

// 处理速度基于你的网络环境和电脑配置

import sharp from 'sharp'
import crypto from 'crypto'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { execSync } from 'child_process'
import { karin, karinPathBase, logger } from 'node-karin'

const CONFIG = {
  CDN_INDEX: 3,
  MAX_CONNECTIONS: 8
}

const baseUrl = `https://cdn-msp${CONFIG.CDN_INDEX}.18comic.vip/media/photos/`

function getNum(aid, parentId) {
  const hash = crypto.createHash('md5')
    .update(String(aid + parentId))
    .digest('hex')
  const code = hash.charCodeAt(hash.length - 1)
  if (aid < 268850)
    return 10
  if (parseInt(aid, 10) > 421926)
    return [2,4,6,8,10,12,14,16][code % 8]
  return [2,4,6,8,10,12,14,16,18,20][code % 10]
}

async function scrambleImageWebP(inputBuffer, aid, parentId) {
  const image = sharp(inputBuffer)
  const metadata = await image.metadata()
  const width = parseInt(metadata.width, 10)
  const height = parseInt(metadata.height, 10)
  const splitCount = getNum(aid, parentId)
  const partHeight = Math.floor(height / splitCount)
  const remainder = height % splitCount

  const parts = await Promise.all(
    Array.from({ length: splitCount }, (_, index) => {
      const partHeightAdjusted = index === 0 ? partHeight + remainder : partHeight
      const top = height - partHeight * (index + 1) - remainder
      return image
        .clone()
        .extract({ 
          left: 0, 
          top, 
          width, 
          height: partHeightAdjusted 
        })
        .toBuffer()
    })
  )

  return sharp({
    create: {
      width,
      height,
      channels: metadata.channels || 4,
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
  let stopProcessing = false
  const results = []
  const concurrency = CONFIG.MAX_CONNECTIONS

  const processPage = async (pageNum) => {
    if (stopProcessing) return null
    const paddedNum = String(pageNum).padStart(5, '0')
    const url = `${baseUrl}${aid}/${paddedNum}.webp`
    
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      if (response.status === 200 && response.data.byteLength > 0) {
        const buffer = Buffer.from(response.data, 'binary')
        const processedBuffer = await scrambleImageWebP(buffer, parseInt(aid, 10), paddedNum)
        return { success: true, pageNum, buffer: processedBuffer }
      }
      stopProcessing = true
    } catch (error) {
      if (error.response && error.response.status === 404) {
        stopProcessing = true
      } else {
        logger.error(`处理 ${url} 失败:`, error.message)
      }
    }
    return null
  }

  const tasks = []
  for (let i = 0; i < concurrency; i++) {
    tasks.push((async () => {
      while (!stopProcessing) {
        const pageNum = currentPage++
        const result = await processPage(pageNum)
        if (result) results.push(result)
        else if (!result && stopProcessing) break
      }
    })())
  }

  await Promise.all(tasks)
  return results.sort((a, b) => a.pageNum - b.pageNum)
}

async function createPdf(imageResults, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false })
    const writeStream = fs.createWriteStream(outputPath)

    doc.pipe(writeStream)

    for (const result of imageResults) {
      const img = doc.openImage(result.buffer)
      const pdfWidth = doc.page ? doc.page.width - 40 : 595 - 40
      const pdfHeight = doc.page ? doc.page.height - 40 : 842 - 40
      const imgWidth = img.width
      const imgHeight = img.height
      
      let finalWidth, finalHeight
      if (imgWidth > pdfWidth || imgHeight > pdfHeight) {
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight)
        finalWidth = imgWidth * ratio
        finalHeight = imgHeight * ratio
      } else {
        finalWidth = imgWidth
        finalHeight = imgHeight
      }

      doc.addPage({ size: [finalWidth + 40, finalHeight + 40] })
      doc.image(result.buffer, 20, 20, {
        width: finalWidth,
        height: finalHeight
      })
    }

    doc.end()
    writeStream.on('finish', () => resolve(outputPath))
    writeStream.on('error', reject)
  })
}

function encryptPdf(inputPath, outputPath, password) {
  execSync(`qpdf --encrypt "${password}" "${password}" 256 -- "${inputPath}" "${outputPath}"`)
  logger.info(`已生成加密PDF: ${outputPath}`)
  fs.unlinkSync(inputPath)
  return outputPath
}

const sendFile = async (ctx, filePath, filename) => {
  try {
    await ctx.bot.uploadFile(ctx.contact, filePath, filename)
  } catch (error) {
    ctx.reply(`上传失败: ${error.message}`, { reply: true })
  }
}

let isProcessing = false
const regex = /^(?:#|\/)?求导(\d*)$/

export const functionEvaluator = karin.command(regex, async (e) => {
  if (isProcessing) return e.reply('上一个任务还没完成呢~', { at: true })
  isProcessing = true

  try {
    const aid = e.msg.match(regex)[1].trim()
    if (!aid) return e.reply('你没有输入要导的数~')
    
    const pluginDir = path.join(karinPathBase, `/temp/function_evaluator/`)
    if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true })

    const pdfPath = path.join(pluginDir, `/jmc_${aid}_raw.pdf`)
    const encryptedPdfPath = path.join(pluginDir, `/jmc_${aid}_encrypted.pdf`)

    if (fs.existsSync(encryptedPdfPath)) {
      return await sendFile(e, encryptedPdfPath, `对 ${aid} 的求导过程.pdf`)
    }

    const { messageId } = await e.reply(`开始对 ${aid} 求导, 请稍后~`, { reply: true })
    
    const processedImages = await processImages(aid)
    if (processedImages.length === 0) {
      await e.bot.recallMsg(e.contact, messageId)
      return e.reply('我还不会求导它...问问别人吧?', { reply: true })
    }

    const the_zero = [
      'ln(1)',
      'sin(0)',
      'cos(pi/2)',
      'tan(0)',
      'e^0 - 1',
      'log(1)',
      'sqrt(0)',
      'integral(0 dx)',
      '(7*8*9+114514)^0 - 1'
    ]
    const randomIndex = Math.floor(Math.random() * the_zero.length)

    e.bot.recallMsg(e.contact, messageId)
    const { messageId: messageId2 } = await e.reply(`求导 ${aid} 完成, 结果为 ${the_zero[randomIndex]} , 正在生成解题过程...`, { reply: true })

    await createPdf(processedImages, pdfPath)
    await encryptPdf(pdfPath, encryptedPdfPath, aid)
    
    await sendFile(e, encryptedPdfPath, `对 ${aid} 的求导过程.pdf`)
    return await e.bot.recallMsg(e.contact, messageId2)
  } finally {
    isProcessing = false
  }
})
