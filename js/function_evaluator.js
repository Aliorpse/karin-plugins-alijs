// 手动导入, 另下 qpdf 并添加到 path
import sharp from 'sharp'
import crypto from 'crypto'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { execSync } from 'child_process'
import { karin, karinPathTemp } from 'node-karin'

const cdn_index = 3
const baseUrl = `https://cdn-msp${cdn_index}.18comic.vip/media/photos/`

async function getMaxPageNum(aid) {
  let maxNum = 0
  let current = 1
  let step = 10

  while (true) {
    const padded = String(current).padStart(5, '0')
    const url = `${baseUrl}${aid}/${padded}.webp`
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      if (response.data.byteLength === 0) break
      maxNum = current
      current += step
    } catch {
      break
    }
  }

  current = maxNum + 1
  step = 3
  let phase2Max = maxNum
  while (true) {
    const padded = String(current).padStart(5, '0')
    const url = `${baseUrl}${aid}/${padded}.webp`
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      if (response.data.byteLength === 0) break
      phase2Max = current
      current += step
    } catch {
      break
    }
  }

  maxNum = Math.max(maxNum, phase2Max)
  current = maxNum + 1
  step = 1
  while (true) {
    const padded = String(current).padStart(5, '0')
    const url = `${baseUrl}${aid}/${padded}.webp`
    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      if (response.data.byteLength === 0) break
      maxNum = current
      current += step
    } catch {
      break
    }
  }

  return maxNum
}

function getNum(aid, parentId) {
  const hash = crypto.createHash('md5')
    .update(String(aid + parentId))
    .digest('hex')
  const code = hash.charCodeAt(hash.length - 1)
  if (parseInt(aid, 10) > 421926) {
    return [2,4,6,8,10,12,14,16][code % 8]
  }
  return [2,4,6,8,10,12,14,16,18,20][code % 10]
}

async function scrambleImageWebP(inputBuffer, outputPath, aid, parentId) {
  try {
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

    await sharp({
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
    .toFile(outputPath)
  } catch (err) {
    console.error(`处理失败 ${outputPath}:`, err)
  }
}

async function batchProcessImages(aid, outputDir) {
  const maxNum = await getMaxPageNum(aid)
  console.log(`检测到最大页数: ${maxNum}`)

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  async function processWithConcurrencyLimit(tasks, concurrency = 5) {
    const results = []
    const running = new Set()

    for (const task of tasks) {
      const promise = (async () => {
        try {
          return await task()
        } catch (error) {
          console.error('任务出错:', error)
          return null
        }
      })()

      running.add(promise)
      promise.finally(() => running.delete(promise))

      results.push(promise)

      if (running.size >= concurrency) {
        await Promise.race(running)
      }
    }

    return Promise.all(results)
  }

  const tasks = []

  for (let i = 1; i <= maxNum; i++) {
    const paddedNum = String(i).padStart(5, '0')
    const fileName = `${paddedNum}.webp`
    const url = `${baseUrl}${aid}/${fileName}`
    const outputPath = path.join(outputDir, fileName)

    tasks.push(async () => {
      try {
        const response = await axios.get(url, { responseType: 'arraybuffer' })
        const buffer = Buffer.from(response.data, 'binary')
        await scrambleImageWebP(buffer, outputPath, parseInt(aid, 10), paddedNum)
        return { success: true, file: outputPath }
      } catch (error) {
        console.error(`处理 ${url} 失败:`, error.message)
        return { success: false, file: url, error: error.message }
      }
    })
  }

  const results = await processWithConcurrencyLimit(tasks)
  const successful = results.filter(r => r && r.success).length
  console.log(`处理完成。成功: ${successful}/${tasks.length}`)
  return results.filter(r => r && r.success).map(r => r.file)
}

async function convertWebPToJpg(webpPath) {
  const jpgPath = webpPath.replace('.webp', '.jpg')
  await sharp(webpPath)
    .jpeg({ quality: 90 })
    .toFile(jpgPath)
  return jpgPath
}

async function createPdf(imagePaths, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const sortedPaths = imagePaths.sort((a, b) => {
        const numA = parseInt(path.basename(a).split('.')[0], 10)
        const numB = parseInt(path.basename(b).split('.')[0], 10)
        return numA - numB
      })

      const jpgPaths = []
      for (const webpPath of sortedPaths) {
        const jpgPath = await convertWebPToJpg(webpPath)
        jpgPaths.push(jpgPath)
      }
      const doc = new PDFDocument({ autoFirstPage: false })
      const writeStream = fs.createWriteStream(outputPath)

      doc.pipe(writeStream)

      for (const imgPath of jpgPaths) {
        try {
          const img = doc.openImage(imgPath)
          const pdfWidth = doc.page ? doc.page.width - 40 : 595 - 40
          const pdfHeight = doc.page ? doc.page.height - 40 : 842 - 40
          const imgWidth = img.width
          const imgHeight = img.height
          let finalWidth, finalHeight

          if (imgWidth > pdfWidth || imgHeight > pdfHeight) {
            const widthRatio = pdfWidth / imgWidth
            const heightRatio = pdfHeight / imgHeight
            const ratio = Math.min(widthRatio, heightRatio)
            finalWidth = imgWidth * ratio
            finalHeight = imgHeight * ratio
          } else {
            finalWidth = imgWidth
            finalHeight = imgHeight
          }

          doc.addPage({ size: [finalWidth + 40, finalHeight + 40] })
          doc.image(imgPath, 20, 20, {
            width: finalWidth,
            height: finalHeight
          })
        } catch (err) {
          console.error(`添加图片 ${imgPath} 到PDF时出错:`, err)
        }
      }

      doc.end()

      writeStream.on('finish', () => {
        jpgPaths.forEach(jpgPath => {
          try {
            fs.unlinkSync(jpgPath)
          } catch (err) {
            console.error(`删除临时文件 ${jpgPath} 时出错:`, err)
          }
        })
        resolve(outputPath)
      })

      writeStream.on('error', (err) => {
        reject(err)
      })
    } catch (err) {
      reject(err)
    }
  })
}

function encryptPdf(inputPath, outputPath, password) {
  try {
    execSync(`qpdf --encrypt "${password}" "${password}" 256 -- "${inputPath}" "${outputPath}"`)
    console.log(`已生成加密PDF: ${outputPath}`)
    return outputPath
  } catch (err) {
    console.error('PDF加密失败:', err)
    throw err
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

    const tempDir = path.join(karinPathTemp, `jmc_images_${aid}`)
    const pdfDir = path.join(karinPathTemp, `jmc_pdf_${aid}`)
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true })
    }
    const pdfPath = path.join(pdfDir, 'raw.pdf')
    const encryptedPdfPath = path.join(karinPathTemp, `jmc_pdf_${aid}/encrypted.pdf`)

    if (fs.existsSync(encryptedPdfPath)) {
      return await sendFile(e, encryptedPdfPath, `对 ${aid} 的求导过程.pdf`)
    }

    try {
      const { messageId } = await e.reply(`开始对 ${aid} 求导, 请稍后~`, { reply: true })
      const processedImagePaths = await batchProcessImages(aid, tempDir)
      await createPdf(processedImagePaths, pdfPath)

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
      e.reply(`求导 ${aid} 完成, 结果为 ${the_zero[randomIndex]} , 正在生成解题过程...`, { reply: true })

      await encryptPdf(pdfPath, encryptedPdfPath, aid)
      await e.bot.recallMsg(e.contact, messageId)
      return await sendFile(e, encryptedPdfPath, `对 ${aid} 的求导过程.pdf`)
    } catch (e) {
      console.error(e)
      return e.reply('处理时发生错误: ' + e.msg)
    }
  } finally {
    isProcessing = false
  }
})

export const sendFile = async (ctx, filePath, filename) => {
  try {
    await ctx.bot.uploadFile(ctx.contact, filePath, filename)
  } catch (error) {
    ctx.reply(`上传失败: ${error.message}`, { reply: true })
  }
}
