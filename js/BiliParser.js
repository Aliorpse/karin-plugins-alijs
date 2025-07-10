import karin, { makeForward, segment } from 'node-karin'

const CONFIG = {
    video: {
        sendLink: true,
        sendVideo: true
    },
}

const REGEX = {
    B23: /(b23\.tv|bili2233\.cn)(\\?\/)\w{7}/,
    BV: /BV1\w{9}/,
    AV: /av\d+/,
}

async function getAPI(url, isJson = true) {
    try {
        const response = await fetch(url, {
            headers: {
                referer: 'https://www.bilibili.com/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
            }
        })
        return isJson ? response.json() : response.arrayBuffer()
    } catch (err) {
        return { code: -400, data: null, message: `API 请求错误: ${err.stack}` }
    }
}

String.prototype.toBV = function() {
    const TABLE = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF'
    const TR = {}
    for (let i = 0; i < 58; i++) TR[TABLE[i]] = i
        
    const S = [11, 10, 3, 8, 4, 6]
    const XOR = 177451812
    const ADD = 8728348608

    const num = (REGEX.AV.exec(this) || [''])[0].replace(/av/gi, '')
    if (!num) return false
    
    let x = (parseInt(num, 10) ^ XOR) + ADD
    const r = Array.from('BV1  4 1 7  ')
    
    S.forEach((pos, i) => r[pos] = TABLE[Math.floor(x / (58 ** i)) % 58])

    return r.join('').replace(/\s/g, '0')
}

Number.prototype.formatted = function () {
    return this < 1e4
        ? this
        : this < 1e8
            ? `${(this / 1e4).toFixed(1)}万`
            : `${(this / 1e8).toFixed(1)}亿`
}

async function getVideo(aid, cid, bvid) {
    const res = await getAPI(`https://api.bilibili.com/x/player/playurl?avid=${aid}&cid=${cid}&qn=16&type=mp4&platform=html5`)
    if (res.code !== 0) return `[${bvid}] 视频获取失败: ${res.message}`

    const video = await getAPI(res.data.durl[0].url, false)
    return segment.video('base64://' + Buffer.from(video).toString('base64'))
}

async function aVParser(id) {
    const BVID = id.toBV()
    return await bVParser(BVID)
}

async function bVParser(id) {
    const { code, data, message } = await getAPI(`https://api.bilibili.com/x/web-interface/view?bvid=${id}`)
    if (code !== 0) {
        return segment.text(`[${id}]解析失败: ${message}`)
    }

    const { title, pic, stat } = data

    // 将在未来 Karin 实现 segment.node 中的 options 时重写
    return makeForward(
        [
            [
                segment.image(pic),
                segment.text(
                    `${title}` +
                    (CONFIG.video.sendLink ? `\nhttps://www.bilibili.com/video/${id}` : '') +
                    '\n-----' +
                    `\n播放: ${stat.view.formatted()} | 弹幕: ${stat.danmaku.formatted()}` +
                    `\n点赞: ${stat.like.formatted()} | 投币: ${stat.coin.formatted()}` +
                    `\n收藏: ${stat.favorite.formatted()} | 评论: ${stat.reply.formatted()}`
                ),
            ],
            (CONFIG.video.sendVideo ? [await getVideo(data.aid, data.cid, id)] : [])
        ],
        `114514`,
        `karin-plugins-alijs`
    )
}


export const BVAVParser = karin.command(new RegExp(`${REGEX.BV.source}|${REGEX.AV.source}`), async e => {
    if (/点赞|投币|播放|弹幕|简介|解析/.test(e.msg) || (!(/B站|Bili|哔哩哔哩|视频/i).test(e.msg))) return
  
    const [match] = e.msg.match(new RegExp(`${REGEX.BV.source}|${REGEX.AV.source}`))
    const msg = REGEX.BV.test(match) ? bVParser(match) : aVParser(match)

    try {
        await e.reply(await msg)
    } catch (err) {
        await e.reply(`B站视频解析失败: ${err.message}`)
    }
})

export const B23Parser = karin.command(REGEX.B23, async e => {
    const shortUrl = e.msg.match(REGEX.B23)[0].replace(/\\/g, '')

    let msg
    try {
        const { url } = await fetch(`https://${shortUrl}`)
        if (REGEX.BV.test(url)) msg = await bVParser(url.match(REGEX.BV)[0])
        else if (REGEX.AV.test(url)) msg = await aVParser(url.match(REGEX.AV)[0])
        else msg = null
    } catch (e) {
        msg = `B站短链解析失败: ${e.stack}`
    }

    if(msg) e.reply(msg)
})
