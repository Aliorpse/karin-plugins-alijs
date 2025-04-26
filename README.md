<div align="center">

# 🤖 karin-plugins-alijs


<p align="center">
  <img src="https://img.shields.io/badge/Karin-f0f0f0?style=for-the-badge" alt="karin">
  <img src="https://img.shields.io/github/license/Aliorpse/karin-plugins-alijs?style=for-the-badge" alt="license">
  <img src="https://img.shields.io/github/stars/Aliorpse/karin-plugins-alijs?style=for-the-badge" alt="stars">
</p>

<p align="center">个人 Karin 框架 App 插件仓库</p>

</div>

## 📥 安装

- 安装: 下载 js 文件并移动到Karin/plugins/karin-plugin-example目录下
- 用法: 详见各 App 插件内部注释

## 📦 插件列表
| 名称 | 源码 | 跳转帮助 |
|:-----|:-----|:-----|
| B站解析 | [BiliParser](https://github.com/Aliorpse/karin-plugins-alijs/blob/main/js/BiliParser.js) | [点我跳转](#BiliParser) |
| MC服务器状态查询 | [MCMotd](https://github.com/Aliorpse/karin-plugins-alijs/blob/main/js/MCMotd.js) | [点我跳转](#MCMotd) |
| 运行命令 | [RunCMD](https://github.com/Aliorpse/karin-plugins-alijs/blob/main/js/RunCMD.js) | [点我跳转](#RunCMD) |
| GH仓库缩略图 | [GHGraphs](https://github.com/Aliorpse/karin-plugins-alijs/blob/main/js/GHGraphs.js) | [点我跳转](#GHGraphs) |
| 函数求**导**器 |[FuncEvaluator](https://github.com/Aliorpse/karin-plugins-alijs/blob/main/js/function_evaluator.js) | [点我跳转](#FuncEvaluator) |

## 📚 使用说明
- ### BiliParser
  本插件用于B站链接解析。可以解析视频，番剧，个人空间，以及 b23 短链。<br>
  插件根据 BV 号, AV 号等匹配,发送链接或BV号等均可返回解析(除了个人空间)
  
    配置文件:
    - `sendLink`: 信息是否包括原链接
    - `sendVideo`: 解析视频时是否返回原视频
  
- ### MCMotd
  本插件用于MC服务器信息解析。支持 Java 和 Bedrock 。
  
    用法:
    - `#motd [IP]` 查询指定服务器信息
    - `#mcsadd [Address]` 添加群聊默认服务器

- ### RunCMD
  本插件用于方便地调用终端执行命令。仅 Bot 主人拥有使用权限。
  > 这个插件还未在除了我的 Windows 以外的任何机器测试过。如果你使用这个插件时出现乱码等错误，请反馈
  
    用法:
    - `(#|/)cmd [command]` 执行指令

- ### GHGraphs
  检测群聊中的 GitHub 仓库链接并解析它们，返回图片。

- ### FuncEvaluator
  非常方便地返回一个常数的导数, 附上求导过程
  > 在处理数字比较小时分割算法不准确, 求pr QAQ

    配置文件:
    - `CDN_ID`: 求导时请求的CDN节点
    - `MAX_CONNECTIONS`: 处理常数时的最大并发连接数
  
    用法:
    - `(#|/)求导[常数]` 开! 导!

## 🙏 致谢
- [BV号转AV号](https://www.zhihu.com/question/381784377/answer/1099438784)
- [B站API User-Agent](https://gitee.com/SmallK111407/earth-k-plugin)
- [我的世界服务器查询API](https://github.com/CikeyQi/mc-plugin)
- [导数分割算法](https://github.com/hect0x7/JMComic-Crawler-Python)
