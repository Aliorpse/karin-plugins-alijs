import karin, { segment } from 'node-karin'

const Config = {
  Video: {
    enable: true,
    sendLink: false,
    sendVideo: true
  },
  Bangumi: {
    enable: true,
    sendLink: false
  },
  Space: {
    enable: true,
    sendLink: false
  }
}

const regB23 = /(b23\.tv|bili2233\.cn)(\\?\/)\w{7}/
const regBV = /BV1\w{9}/
const regAV = /av\d+/
const regMD = /md\d+/
const regSS = /ss\d+/
const regEP = /ep\d+/
const regSpace = /space\.bilibili\.com\/\d+/

async function biliRequest(url, method) {
  try {
    const response = await fetch(url, {
      headers: {
        referer: 'https://www.bilibili.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
      }
    })
    return method === 'json' ? response.json() : response.arrayBuffer()
  } catch (e) {
    return { code: -400, message: `请求API失败: ${e.stack}` }
  }
}

const av2bv = (() => {
  const TABLE = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF'
  const TR = {}
  for (let i = 0; i < 58; i++) TR[TABLE[i]] = i
  
  const S = [11, 10, 3, 8, 4, 6]
  const XOR = 177451812
  const ADD = 8728348608

  return av => {
    const num = (regAV.exec(av) || [''])[0].replace(/av/gi, '')
    if (!num) return false
    
    let x = (parseInt(num, 10) ^ XOR) + ADD
    const r = ['B', 'V', '1', ' ', ' ', '4', ' ', '1', ' ', '7', ' ']
    
    S.forEach((pos, i) => r[pos] = TABLE[Math.floor(x / (58 ** i)) % 58])
    return r.join('').replace(/\s/g, '0')
  }
})()

const formatNumber = num => 
  num < 1e4 ? num :
  num < 1e8 ? `${(num / 1e4).toFixed(1)}万` : `${(num / 1e8).toFixed(1)}亿`

async function b23Parser(msg) {
  try {
    const shortUrl = msg.match(regB23)[0].replace(/\\/g, '')
    const { url } = await fetch(`https://${shortUrl}`)
    if (regBV.test(url)) return bvParser(url.match(regBV)[0])
    if (regAV.test(url)) return bvParser(av2bv(url.match(regAV)[0]))
    if (regMD.test(url)) return mdParser(url.match(regMD)[0])
    if (regSS.test(url)) return ssParser(url.match(regSS)[0])
    if (regEP.test(url)) return epParser(url.match(regEP)[0])
    if (regSpace.test(url)) return spaceParser(url.match(regSpace)[0])
    return null

  } catch (e) {
    return `短链解析失败: ${e.stack}`
  }
}

async function bvParser(bvid) {
  const { code, data, message } = await biliRequest(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, 'json')
  if (code !== 0) return { msg: `[${bvid}] 解析失败: ${message}`, data: [null, null, null] }

  const { title, pic, stat } = data
  const info = [
    `${title}`,
    Config.Video.sendLink ? `\nhttps://www.bilibili.com/video/${bvid}` : '',
    '\n-----',
    `\n播放: ${formatNumber(stat.view)} | 弹幕: ${formatNumber(stat.danmaku)}`,
    `\n点赞: ${formatNumber(stat.like)} | 投币: ${formatNumber(stat.coin)}`,
    `\n收藏: ${formatNumber(stat.favorite)} | 评论: ${formatNumber(stat.reply)}`
  ]

  return {
    msg: [
      segment.image(pic),
      ...info
    ],
    data: [data.aid, data.cid, bvid]
  }
}

async function videoParser(aid, cid, bvid) {
  if (aid == null) return
  const res = await biliRequest(`https://api.bilibili.com/x/player/playurl?avid=${aid}&cid=${cid}&qn=16&type=mp4&platform=html5`, 'json')
  if (res.code !== 0) return `[${bvid}] 视频获取失败: ${res.message}`
  
  const video = await biliRequest(res.data.durl[0].url, 'arrayBuffer')
  return segment.video('base64://' + Buffer.from(video).toString('base64'))
}

async function mdParser(md) {
  const { code, result, message } = await biliRequest(`https://api.bilibili.com/pgc/review/user?media_id=${md.replace("md", "")}`, 'json')
  if (code !== 0) return { msg: `[${md}] 解析失败: ${message}` }
  return ssParser(`ss${result.media.season_id}`)
}

async function ssParser(ss) {
  const { code, result, message } = await biliRequest(`https://api.bilibili.com/pgc/web/season/section?season_id=${ss.replace('ss', '')}`, 'json')
  if (code !== 0) return { msg: `[${ss}] 解析失败: ${message}` }
  return epParser(`ep${result.main_section.episodes[0].id}`)
}

async function epParser(ep) {
  const { code, result, message } = await biliRequest(`https://api.bilibili.com/pgc/view/web/season?ep_id=${ep.replace('ep', '')}`, 'json')
  if (code !== 0) return { msg: `[${ep}] 解析失败: ${message}` }
  const { title, cover, stat, link, rating } = result

  return {
    msg: [
      segment.image(cover),
      `${title}`,
      Config.Bangumi.sendLink ? `\n${link}` : '',
      '\n-----',
      `\n播放: ${formatNumber(stat.views)} | ${rating ? `评分: ${rating.score}` : ''}`,
      `\n点赞: ${formatNumber(stat.likes)} | 投币: ${formatNumber(stat.coins)}`,
      `\n弹幕: ${formatNumber(stat.danmakus)} | 收藏: ${formatNumber(stat.favorite)}`
    ]
  }
}

async function spaceParser(mid){
    console.log(mid)
    mid = mid.replace('space.bilibili.com/', '')
    const { code, data, message } = await biliRequest(`https://api.bilibili.com/x/web-interface/card?mid=${mid}`, 'json')
    if (code !== 0) return { msg: `[${mid}] 解析失败: ${message}` }

    const { name, face, fans, friend, sign, spacesta } = data.card
    const { card } = data
    const level = card.level_info.current_level
    const vip = card.vip.status == 1 ? `[${card.vip.label.text}]` : ''
    const offical = card.Official.title ? `\n[认证]${card.Official.title}` : ''
    const banned = spacesta == -2 ? `\n该用户已被封禁。` : ''

    return {
      msg: [
        segment.image(face),
        `${vip}${name} - Lv.${level}`,
        `${offical}`,
        Config.Space.sendLink ? `\nhttps://space.bilibili.com/${mid}` : '',
        '\n-----',
        `\n签名: ${sign}`,
        `\n粉丝: ${formatNumber(fans)} | 关注:${formatNumber(friend)}`,
        `${banned}`
      ]
    }
}

export const Video = karin.command(new RegExp(`${regBV.source}|${regAV.source}`), async e => {
  if (!Config.Video.enable || /点赞|投币|播放|弹幕|简介|解析/.test(e.msg)) return
  
  const [match] = e.msg.match(new RegExp(`${regBV.source}|${regAV.source}`))

  const bvid = regBV.test(match) ? match : av2bv(match)
  const result = await bvParser(bvid)
  
  await e.reply(result.msg, { reply: true })
  return Config.Video.sendVideo && e.reply(await videoParser(...result.data))
})

export const Bangumi = karin.command(new RegExp(`${regSS.source}|${regEP.source}|${regMD.source}`), async e => {
  if (!Config.Bangumi.enable || /点赞|投币|播放|弹幕|简介|解析/.test(e.msg)) return

  const [match] = e.msg.match(new RegExp(`${regSS.source}|${regEP.source}|${regMD.source}`))
  let result = []

  if (regMD.test(match)) result = await mdParser(match)
  else if (regSS.test(match)) result = await ssParser(match)
  else result = await epParser(match)

  return e.reply(result.msg, { reply: true })
})

export const Space = karin.command(regSpace, async e => {
    if (!Config.Space.enable || /粉丝|投币|收藏|等级|会员/.test(e.msg)) return

    const [match] = e.msg.match(regSpace)
    const result = await spaceParser(match)

    return e.reply(result.msg, { reply: true })
})

export const b23 = karin.command(regB23, async e => {
  const result = await b23Parser(e.msg)
  result && e.reply(result.msg, { reply: true })
  if (result.data != undefined)
    return Config.Video.sendVideo && e.reply(await videoParser(...result.data))
  return
})
