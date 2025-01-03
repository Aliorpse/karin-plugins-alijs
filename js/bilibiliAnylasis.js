import karin, { segment } from 'node-karin'

/*
 * 配置项
 * sendVideo: true/false 解析视频是否返回原视频
 * sendImage: true/false 解析视频是否以图片形式返回消息 仍未完成
 * sendLink: true/false 解析是否返回原链接
 */
const sendVideo = false
const sendImage = false
const sendLink = false

const regB23 = /(b23\.tv|bili2233.cn)\\?\/\w{7}/
const regBV = /BV1\w{9}/
const regAV = /av\d+/
const regMD = /md\d+/ // media_id 番剧md号
const regSS = /ss\d+/ // season_id 番剧id
const regEP = /ep\d+/ // episode_id 番剧剧集编号

const regVideo = new RegExp(`${regB23.source}|${regBV.source}|${regAV.source}`)
const regBangumi = new RegExp(`${regMD.source}|${regSS.source}|${regEP.source}`)

const headers = {
    headers: {
        'referer': 'https://www.bilibili.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
    }
}

function formatNumber(num) {
    if(num < 10000){
        return num
    }else{
        return (num/10000).toFixed(1) + "万"
    }
}

function fail(e,msg,id){
    console.log(id)
    if(!(e.msg == id || e.msg.includes(`bilibili` || `b站` || `B站`))){ return true }
    return e.reply(`[${id}]解析失败\n信息: ${msg}`, { recallMsg: 5 })
    
}

export const video = karin.command(regVideo, async (e) => {

    let bvid = ""
    let id = ""

    //绕过其他解析bot
    if(e.msg.includes("点赞" || "投币" || "播放" || "弹幕" || "简介")){ return true }

    //由av,b23短链,BV提取出BV并解析
    // av->bv
    // b23->bv
    // bv->bv

    //av号逻辑
    if(e.msg.match(regAV)){
        let table = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF'
        let tr = {}
        for (let i = 0; i < 58; i++) { tr[table[i]] = i }
        const s = [11, 10, 3, 8, 4, 6]
        const xor = 177451812
        const add = 8728348608
        let x = (regAV.exec(e.msg))[0].replace(/av/g,"")
        id = `av` + x
        x = (x ^ xor) + add
        const r = Array.from('BV1  4 1 7  ')
        for (let i = 0; i < 6; i++) {
            r[s[i]] = table[Math.floor(x / 58 ** i) % 58]
        }
        bvid = r.join("")
        if(!(bvid.match(regBV))){
            return
        }
    }

    //b23短链逻辑
    if(e.msg.match(regB23)){
        try{
            bvid = regBV.exec((await fetch("https://"+(regB23.exec(e.msg)[0]).replace(/\\/g,""))).url)
            if(bvid == null){
                return
            }
        }catch(e){ return }
        id = regB23.exec(e.msg)[0]
    }

    //BV逻辑
    if(e.msg.match(regBV)){
        bvid = regBV.exec(e.msg)
        id = bvid
    }

    //开始解析
    let res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,headers)
    res = await res.json()

    if(res.code != 0){
        return fail(e,res.message,id)
    }
    if(!sendImage){
        e.reply([
            segment.image(res.data.pic),
            `${res.data.title}${sendLink ? `\nhttps://www.bilibili.com/video/${bvid}`: ``}\n作者: ${res.data.owner.name}\n播放: ${formatNumber(res.data.stat.view)} | 弹幕: ${formatNumber(res.data.stat.danmaku)}\n点赞: ${formatNumber(res.data.stat.like)} | 投币: ${formatNumber(res.data.stat.coin)}\n收藏: ${formatNumber(res.data.stat.favorite)} | 评论: ${formatNumber(res.data.stat.reply)}`
        ],{ reply: true })
    }else{
        //todo: 图片
    }

    //返回原视频
    if(!sendVideo){ return }
    res = await fetch(`https://api.bilibili.com/x/player/playurl?avid=${res.data.aid}&cid=${res.data.cid}&qn=16&type=mp4&platform=html5`,headers)
    res = await res.json()

    if(!res || res.code != 0){
        return fail(e,res.message,`视频`)
    }
    res = await (await fetch(res.data.durl[0].url,headers)).arrayBuffer()
    return e.reply(segment.video('base64://' + Buffer.from(res).toString('base64')))
},{ name: "B站视频解析" })

export const bangumi = karin.command(regBangumi, async (e) => {

    let epid = ""
    let ssid = ""

    //绕过其他解析bot
    if(e.msg.includes("点赞" && "投币")){ return true }

    //由md,ss,ep提取出ep并执行解析
    // md->ss->ep
    // ss->ep
    // ep->ep

    //md逻辑
    if(e.msg.match(regMD)){
        try{
            let temp = await (await fetch(`https://api.bilibili.com/pgc/review/user?media_id=${(regMD.exec(e.msg))[0].replace("md", "")}`,headers)).json()
            if(temp.code != 0){
                return fail(e,temp.message,(regMD.exec(e.msg))[0])
            }
            ssid = temp.result.media.season_id
        }catch(e){ return }
    }

    //ss逻辑
    if(e.msg.match(regSS) || ssid != ""){
        if(ssid == ""){
            ssid = (regSS.exec(e.msg))[0].replace("ss", "")
        }
        let temp = await (await fetch(`https://api.bilibili.com/pgc/web/season/section?season_id=${ssid}`,headers)).json()
        if(temp.code != 0){
            return fail(e,temp.message,ssid)
        }
        epid = (temp.result.main_section.episodes[0].share_url).replace("https://www.bilibili.com/bangumi/play/ep","")
    }

    //ep逻辑
    if(e.msg.match(regEP)){
        epid = (regEP.exec(e.msg))[0].replace("ep", "")
    }

    //开始解析
    let res = await (await fetch(`https://api.bilibili.com/pgc/view/web/season?ep_id=${epid}`,headers)).json()
    if(res.code != 0){
        return fail(e,res.message,epid)
    }
    if(!sendImage){
        return e.reply([
            segment.image(res.result.cover),
            `${res.result.title}\n评分: ${res.result.rating.score} / ${res.result.rating.count}\n${res.result.new_ep.desc}, ${res.result.seasons[0].new_ep.index_show}\n`,
            "---\n",
            `${sendLink ? res.result.link : ``}\n播放: ${formatNumber(res.result.stat.views)} | 弹幕: ${formatNumber(res.result.stat.danmakus)}\n点赞: ${formatNumber(res.result.stat.likes)} | 投币: ${formatNumber(res.result.stat.coins)}\n追番: ${formatNumber(res.result.stat.favorites)} | 收藏: ${formatNumber(res.result.stat.favorite)}\n`
        ],{ reply: true })
    }else{
        //todo: 图片
    }

},{ name: "B站番剧解析" })
