/**
 * #motd [IP] 查询指定服务器信息
 * #mcsadd [Address] 添加群聊默认服务器
 * 
 * 如果发现有一些服务器无法查询, 可以选择自建API, 私信QQ3521766148获取服务端或者参考以下链接
 * https://github.com/Aliorpse/kotlin-mcutils
 * https://aliorpse.github.io/kotlin-mcutils/mcutils/tech.aliorpse.mcutils.model.status/-server-status/index.html
 * 你的API直接返回ServerStatus就行
 */

import karin, { segment, render, server } from 'node-karin'
import fs from 'fs'

const REGS = {
    MOTD: /^#motd(.*)/,
    MCSADD: /^#mcsadd(.*)/
}

const API_BASE_URL = 'https://api.aliorpse.tech/minecraft/server/status'
const DATA_BASE_URL = './data/karin-plugins-alijs/MCMotd'

const defaultFavicon = "data:image/png;base64,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"

if (!fs.existsSync(`${DATA_BASE_URL}/server_aliases.json`)) {
    fs.mkdirSync(`./data/karin-plugins-alijs`)
    fs.mkdirSync(`${DATA_BASE_URL}`)
    fs.writeFileSync(`${DATA_BASE_URL}/server_aliases.json`, "{}")
}

export const mcsadd = karin.command(REGS.MCSADD, async (e) => {
    const content = e.msg.match(REGS.MCSADD)[1].trim()
    let alias = JSON.parse(fs.readFileSync(`${DATA_BASE_URL}/server_aliases.json`, 'utf-8'))

    if (content === "" && !e.isGroup) {
        return e.reply('用法: #mcsadd [IP Address], 仅限群聊', { recallMsg: 30, reply: true })
    }

    if (e.sender.role === "admin" || e.sender.role === "owner" || e.isMaster) {
        alias[e.group_id] = content
        fs.writeFileSync(`${DATA_BASE_URL}/server_aliases.json`, JSON.stringify(alias, null, 2))
        return e.reply(`添加成功: ${e.group_id} => ${content}`, { reply: true })
    } else {
        return e.reply('该功能仅限群管理或主人', { recallMsg: 30, reply: true })
    }
})

export const motd = karin.command(REGS.MOTD, async (e) => {
    let alias = JSON.parse(fs.readFileSync(`${DATA_BASE_URL}/server_aliases.json`, 'utf-8'))
    let serverAddress = e.msg.match(REGS.MOTD)[1].trim() || alias[e.group_id] || null

    if (!serverAddress) {
        return e.reply('用法: #motd [IP Address]\n你可以通过"#mcsadd [IP Address]"来增设本群默认服务器', { recallMsg: 30, reply: true })
    }

    const [ip, port] = serverAddress.split(':')

    if (ip.match(/127\..*/) || ip === "localhost") {
        return e.reply("不支持查询回环地址", { recallMsg: 30, reply: true })
    }

    const { messageId } = await e.reply(`正在查询 ${serverAddress}, 请稍后...`, { reply: true })

    let serverStatus = await fetchServerStatus(ip, port)
    serverStatus = serverStatus.javaStatus || serverStatus.bedrockStatus

    if (!serverStatus) {
        e.reply(`查询失败, 请稍后再试。`, { recallMsg: 30, reply: true })
        return await e.bot.recallMsg(e.contact, messageId)
    }

    const serverType = serverStatus.hasOwnProperty("enforcesSecureChat") ? "Java" : "Bedrock"

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        .body {
            width: 900px;
            height: auto;
            border-radius: 20px;
        }
        .box {
            display: flex;
            align-items: center;
            width: 900px;
            height: auto;
            background: #262624;
            background-size: cover;
            background-repeat: no-repeat;
            background-position: center center;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            padding: 16px;
        }
        .icon {
            border-radius: 20px;
        }
        .divider {
            width: 2px;
            height: 120px;
            background-color: #555;
            margin: 0 24px;
        }
        .info {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            font-family: "阿里巴巴普惠体", sans-serif;
            color: white;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 1);
        }
        .motd {
            font-size: 26px;
            margin: 0 0 8px 0;
            white-space: pre-wrap;
        }
        .details {
            font-size: 20px;
            margin: 0;
        }
        .details span.ip {
            text-decoration: underline;
        }
    </style>
</head>
<body class="body">
    <div class="box">
        <img class="icon" src="${serverStatus.favicon ? serverStatus.favicon : defaultFavicon}" alt="icon" width="128" height="128">
        <div class="divider"></div>
        <div class="info">
            <p class="motd">${(renderTextComponent(serverStatus.description.obj)).replace(/\n/g, "\n")}</p>
            <p class="details">
                IP: <span class="ip">${serverAddress}</span> | Ping(HK): ${serverStatus.ping}ms<br>
                在线: ${serverStatus.players.online}/${serverStatus.players.max} | ${serverType} - ${serverStatus.version.name}(${serverStatus.version.protocol})
            </p>
        </div>
    </div>
</body>
</html>

`

    fs.writeFileSync(`${DATA_BASE_URL}/temp.html`, html, 'utf-8')
    const img = await render.renderHtml(`${DATA_BASE_URL}/temp.html`)

    await e.bot.recallMsg(e.contact, messageId)
    return e.reply(segment.image(`base64://${img}`), { reply: true })
})

async function fetchServerStatus(ip, port) {
    const fetchStatus = async (type, _port) => {
        try {
            // if port undefined, java uses 25565 and bedrock uses 19132
            const actualPort = port === undefined
                ? type === 'JAVA' ? 25565 : 19132
                : _port

            const res = await fetch(`${API_BASE_URL}?host=${ip}&port=${actualPort}&type=${type}`)
            console.log(res)
            return await res.json()
        } catch (_) {
            return null
        }
    }

    const [javaStatus, bedrockStatus] = await Promise.all([
        fetchStatus('JAVA', port),
        fetchStatus('BEDROCK', port),
    ])

    return { javaStatus, bedrockStatus }
}

const NamedColorMap = {
    BLACK: "#000000",
    DARK_BLUE: "#0000AA",
    DARK_GREEN: "#00AA00",
    DARK_AQUA: "#00AAAA",
    DARK_RED: "#AA0000",
    DARK_PURPLE: "#AA00AA",
    GOLD: "#FFAA00",
    GRAY: "#AAAAAA",
    DARK_GRAY: "#555555",
    BLUE: "#5555FF",
    GREEN: "#55FF55",
    AQUA: "#55FFFF",
    RED: "#FF5555",
    LIGHT_PURPLE: "#FF55FF",
    YELLOW: "#FFFF55",
    WHITE: "#FFFFFF"
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
}

function renderTextComponent(component) {
    if (!component) return ""

    const render = (obj) => {
        const {
            text = "",
            color,
            bold,
            italic,
            underlined,
            strikethrough,
            obfuscated,
        } = obj

        let style = ""

        const finalColor = (NamedColorMap[color?.toUpperCase()] || color || "#FFFFFF").toLowerCase()
        if (finalColor) style += `color: ${finalColor};`
        if (bold) style += "font-weight: bold;"
        if (italic) style += "font-style: italic;"
        if (underlined) style += "text-decoration: underline;"
        if (strikethrough) style += "text-decoration: line-through;"
        if (obfuscated) style += "filter: blur(2px);"

        return `<span style="${style}">${escapeHtml(text)}</span>`
    };

    let result = render(component)
    if (Array.isArray(component.extra)) {
        for (const child of component.extra) {
            result += renderTextComponent(child)
        }
    }

    return result
}
