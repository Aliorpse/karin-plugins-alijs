// 需要安装 qpdf 并且将它添加至环境变量中, 否则无法加密 pdf
// 需要额外添加的包: sharp crypto axios pdfkit

// 脚本基于类二分法找到漫画关键元数据, 直接访问图片链接, 不会被 cf 拦住 (你得有个能正常访问的IP)
// 但也正因为这样, 绕过了爬取元数据的方法, 导致执行会稍慢
//
// 并发处理数不要太高, 爱护jm谢谢, 请注意这个数不会影响获取元数据的速度
// 总处理速度基于你的网络环境和电脑配置

// 插件用法: #求导+要导的数
// 例如 #求导350234

import sharp from 'sharp'
import crypto from 'crypto'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { execSync } from 'child_process'
import { karin, karinPathBase } from 'node-karin'

const CONFIG = {
  // CDN节点
  // 可以的值为 "", 2 ,3
  // 哪个访问快就用哪个, 我懒得做ping测试了
  CDN_INDEX: 3,
  // 下载图片并发连接数, 过高可能被封禁?
  MAX_CONNECTIONS: 10,
}

const baseUrl = `https://cdn-msp${CONFIG.CDN_INDEX}.18comic.vip/media/photos/`
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

async function scrambleImageWebP(inputBuffer, aid, parentId) {
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

    return await sharp({
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
  } catch (err) {
    console.error(`处理失败:`, err)
    throw err
  }
}

async function processImages(aid) {
  const maxNum = await getMaxPageNum(aid)
  if(maxNum == 0) return false
  console.log(`检测到最大页数: ${maxNum}`)

  async function processWithConcurrencyLimit(tasks, concurrency) {
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
    const url = `${baseUrl}${aid}/${paddedNum}.webp`

    tasks.push(async () => {
      try {
        const response = await axios.get(url, { responseType: 'arraybuffer' })
        const buffer = Buffer.from(response.data, 'binary')
        const processedBuffer = await scrambleImageWebP(buffer, parseInt(aid, 10), paddedNum)
        return { 
          success: true, 
          pageNum: i,
          buffer: processedBuffer 
        }
      } catch (error) {
        console.error(`处理 ${url} 失败:`, error.message)
        return { success: false, pageNum: i, error: error.message }
      }
    })
  }

  const results = await processWithConcurrencyLimit(tasks, CONFIG.MAX_CONNECTIONS)
  const successful = results.filter(r => r && r.success).length
  console.log(`处理完成。成功: ${successful}/${tasks.length}`)
  
  return results
    .filter(r => r && r.success)
    .sort((a, b) => a.pageNum - b.pageNum)
}

async function createPdf(imageResults, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ autoFirstPage: false })
      const writeStream = fs.createWriteStream(outputPath)

      doc.pipe(writeStream)

      for (const result of imageResults) {
        try {
          const img = doc.openImage(result.buffer)
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
          doc.image(result.buffer, 20, 20, {
            width: finalWidth,
            height: finalHeight
          })
        } catch (err) {
          console.error(`添加图片 ${result.pageNum} 到PDF时出错:`, err)
        }
      }

      doc.end()

      writeStream.on('finish', () => {
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
    // Remove the unencrypted PDF
    fs.unlinkSync(inputPath)
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
    
    const pluginDir =path.join(karinPathBase, `/temp/function_evaluator/`)

    if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true })

    const pdfPath = path.join(pluginDir, `/jmc_${aid}_raw.pdf`)
    const encryptedPdfPath = path.join(pluginDir, `/jmc_${aid}_encrypted.pdf`)

    if (fs.existsSync(encryptedPdfPath)) {
      return await sendFile(e, encryptedPdfPath, `对 ${aid} 的求导过程.pdf`)
    }

    try {
      const { messageId } = await e.reply(`开始对 ${aid} 求导, 请稍后~`, { reply: true })
      
      const processedImages = await processImages(aid)

      if (!processedImages) {
        await e.bot.recallMsg(e.contact, messageId)
        return e.reply('我还不会求导它...问问别人吧?', { reply: true })
      }

      await createPdf(processedImages, pdfPath)

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
    } catch (err) {
      console.error(err)
      return e.reply('处理时发生错误: ' + err.message)
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
