import karin, { segment } from 'node-karin'

const regGH = /github.com\/[a-zA-Z0-9-]{1,39}\/[a-zA-Z0-9_-]{1,100}(?:\/(?:pull|issues)\/\d+)?/

export const GHGraphs = karin.command(regGH, async (e) => {
    const API_URL = "https://opengraph.githubassets.com"
    const PLUGIN_ID = "karin-plugins-alijs_GHGraphs"

    const match = e.msg.match(regGH)
    if (!match) return

    const repoPath = match[0].replace("github.com/", "")
    return e.reply(segment.image(`${API_URL}/${PLUGIN_ID}/${repoPath}`))
})
