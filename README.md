# karin-plugins-alijs
个人 Karin 机器人框架app插件仓库

## 📥 安装

- 安装: 下载js文件并移动到Karin/plugins/karin-plugin-example目录下
- 用法: 详见各app插件内部注释

## 📦 插件列表
| 名称 | 源码 | 跳转帮助 |
|:-----|:-----|:-----|
| B站解析 | [BiliParser](https://github.com/Aliorpse/karin-plugins-alijs/blob/main/js/biliParser.js) | [点我跳转](#BiliParser) |
| MC服务器状态查询 | [MCMotd](https://github.com/Aliorpse/karin-plugins-alijs/blob/main/js/MCMotd.js) | [点我跳转](#MCMotd) |
| 运行命令 | [RunCMD](https://github.com/Aliorpse/karin-plugins-alijs/blob/main/js/RunCMD.js) | [点我跳转](#RunCMD) |

## 📚 使用说明
- ### BiliParser
  本插件用于B站链接解析。可以解析视频，番剧，个人空间，以及b23短链。<br>
  插件根据BV号,AV号等匹配,发送链接或BV号等均可返回解析(除了个人空间)
  
    配置文件:
    - `sendLink`: 信息是否包括原链接
    - `sendVideo`: 解析视频时是否返回原视频
  
- ### MCMotd
  本插件用于MC服务器信息解析。支持Java和基岩版。
  
    用法:
    - `#motd [IP]` 查询指定服务器信息
    - `#mcsadd [Address]` 添加群聊默认服务器

- ### RunCMD
  本插件用于方便地调用终端执行命令。仅机器人主人拥有使用权限。<br>
  这个插件还未在除了我的Windows以外的任何机器测试过。如果你使用这个插件时出现乱码等错误，请反馈
  
    用法:
    - `(#|/)cmd [command]` 执行指令

## 🙏致谢
- [BV号转AV号](https://www.zhihu.com/question/381784377/answer/1099438784)
- [B站API User-Agent](https://gitee.com/SmallK111407/earth-k-plugin)
- [我的世界服务器查询API](https://github.com/CikeyQi/mc-plugin)
