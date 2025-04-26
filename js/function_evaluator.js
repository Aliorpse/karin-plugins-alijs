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
  CDN_ID: 'cdn-msp3',
  MAX_CONNECTIONS: 8
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
  if (splitCount === 0) 
    return image.jpeg({ quality: 90 }).toBuffer()

  const metadata = await image.metadata()
  const width = parseInt(metadata.width, 10)
  const height = parseInt(metadata.height, 10)
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
    const doc = new PDFDocument({
      autoFirstPage: false,
      size: 'A4',
      margins: { top: 20, left: 20, right: 20, bottom: 20 }
    })

    const writeStream = fs.createWriteStream(outputPath)
    doc.pipe(writeStream)

    const pageWidth = 595.28
    const pageHeight = 841.89
    const contentWidth = pageWidth - 40
    const contentHeight = pageHeight - 40

    for (const result of imageResults) {
      const img = doc.openImage(result.buffer)
      
      const scaleRatio = Math.min(
        contentWidth / img.width,
        contentHeight / img.height
      )
      
      const finalWidth = img.width * scaleRatio
      const finalHeight = img.height * scaleRatio
      const xPos = (pageWidth - finalWidth) / 2
      const yPos = (pageHeight - finalHeight) / 2

      doc.addPage({ size: [pageWidth, pageHeight] })
      doc.image(img, xPos, yPos, {
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
      return await e.bot.uploadFile(e.contact, encryptedPdfPath, `对 ${aid} 的求导过程.pdf`)
    }

    const { messageId } = await e.reply(`开始对 ${aid} 求导, 请稍后~`, { reply: true })
    
    const processedImages = await processImages(aid)
    if (processedImages.length === 0) {
      await e.bot.recallMsg(e.contact, messageId)
      return e.reply('我还不会求导它...问问别人吧?', { reply: true })
    }

    const the_zero = [ 'ln(1)', 'sin(0)', 'cos(pi/2)', 'tan(0)', 'e^0 - 1', 'log(1)', 'sqrt(0)', 'integral(0 dx)', '(7*8*9+114514)^0 - 1' ]
    const randomIndex = Math.floor(Math.random() * the_zero.length)

    e.bot.recallMsg(e.contact, messageId)
    const { messageId: messageId2 } = await e.reply(`求导 ${aid} 完成, 结果为 ${the_zero[randomIndex]} , 正在生成解题过程...`, { reply: true })

    await createPdf(processedImages, pdfPath)
    await encryptPdf(pdfPath, encryptedPdfPath, aid)
    
    await e.bot.uploadFile(e.contact, encryptedPdfPath, `对 ${aid} 的求导过程.pdf`)
    return await e.bot.recallMsg(e.contact, messageId2)
  } catch (error) {
    logger.error(error)
    return e.reply('出错了, 请查看控制台', { reply: true })
  }
   finally {
    isProcessing = false
  }
})
