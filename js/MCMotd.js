/**
 * #motd [IP] 查询指定服务器信息
 * #mcsadd [Address] 添加群聊默认服务器
 */

import karin, { segment, render } from 'node-karin'
import fs from 'fs'

const regMotd = /^#motd(.*)/
const regAdd = /^#mcsadd(.*)/

let alias;
const baseUrl = 'https://api.mcstatus.io/v2'
const baseDataUrl = './data/karin-plugins-alijs/McMotd'

if (!fs.existsSync(`${baseDataUrl}/SAlias.json`)) {
    fs.mkdirSync(`./data/karin-plugins-alijs`)
    fs.mkdirSync(`${baseDataUrl}`)
    fs.writeFileSync(`${baseDataUrl}/SAlias.json`,"{}")
}

export const mcsadd = karin.command(regAdd, async (e) => {

    const content = e.msg.match(regAdd)[1].replace(/\s/g, '')
    alias = fs.readFileSync(`${baseDataUrl}/SAlias.json`)
    alias = JSON.parse(alias)
    
    if (content == "" && !e.isGroup) {
        return e.reply('用法: #mcsadd [IP Address],仅限群聊',{ recallMsg: 30, reply: true })
    }
    if((e.sender.role == "admin" || e.sender.role == "owner" || e.isMaster)) {
        alias[e.group_id] = content
        fs.writeFileSync(`${baseDataUrl}/SAlias.json`,JSON.stringify(alias))
        return e.reply(`添加成功: ${e.group_id} => ${content}`,{ reply: true })
    }else{
        return e.reply('该功能仅限群管理或主人',{ recallMsg: 30, reply: true })
    }
    
})

export const motd = karin.command(regMotd, async (e) => {
    
    alias = fs.readFileSync(`${baseDataUrl}/SAlias.json`)
    alias = JSON.parse(alias)

    let content = e.msg.match(regMotd)[1].replace(/\s/g, '')
    if (content == "") {
        if(e.group_id in alias){
            content = alias[e.group_id]
        }else{
            return e.reply('用法: #motd [IP Address]\n你可以通过"#mcsadd [IP Address]"来增设本群默认服务器',{ recallMsg: 30, reply: true })
        }
    }
    
    let isJava = true
    
    if (content.match(/127\..*/) || content == "localhost"){
        return e.reply("不支持查询回环地址",{ recallMsg: 30, reply: true })
    }
    
    e.reply(`正在查询[${content}],请稍后`,{ recallMsg: 10 })
    
    let startTime = performance.now()
    let res = await (await fetch(`${baseUrl}/status/java/` + content)).json()
    if(res.online == false) {
        res = await (await fetch(`${baseUrl}/status/bedrock/` + content)).json()
        isJava = false
    }
    let endTime = ((performance.now() - startTime)/1000).toFixed(2)
    
    if(res.online == false){
        return e.reply(`所查的服务器不在线\n查询IP: ${content}`,{ recallMsg: 30, reply: true })
    }
    
    let serverVersion;
    if(isJava){
        serverVersion = `Java - ${res.version.name_clean}[${res.version.protocol}]`
    }else{
        serverVersion = `Bedrock - ${res.version.name}[${res.version.protocol}]`
    }
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        .body {
            width: 1000px;
            height: 160px;
            border-radius: 20px;
        }
        .box {
            display: flex;
            align-items: center;
            width: 1000px;
            height: 160px;
            background-image: url("favicon.jpg");
            background-size: cover;
            background-repeat: no-repeat;
            background-position: center center;
            border-radius: 10px;
        }
        .icon {
            margin-left: 16px;
            border-radius: 20px;
        }
        .text {
            font-family: "阿里巴巴普惠体",sans-serif;
            flex-grow: 1;
            color: white;
            font-size: 26px;
            padding-left: 20px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 1);
            white-space: pre;
        }
    </style>
</head>
<body class="body">
    <div class="box">
        <img class="icon" src="favicon.jpg" alt="icon" width="128" height="128">
        <p class="text">${(res.motd.html).replace("\n","<br>").replace(/\n/g,"")}
IP: <span style="text-decoration: underline;">${content}</span> | 请求耗时: ${endTime}s
在线: ${res.players.online}/${res.players.max} | ${serverVersion}</p>
    </div>
</body>
</html>
`

    if(isJava){
        if (res.icon == null) {
            html = html.replace(/favicon.jpg/g,`${baseUrl}/icon`)
        }else{
            html = html.replace(/favicon.jpg/g, res.icon)
        }
    }else{
        html = html.replace("margin-left: 16px;","margin-left: 16px;display: none;")
    }
    
    fs.writeFileSync(`${baseDataUrl}/temp.html`,html)
    const img = await render.renderHtml(`${baseDataUrl}/temp.html`)
    
    return e.reply(segment.image(img),{ reply: true })
})