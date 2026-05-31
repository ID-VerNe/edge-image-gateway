## 🌐 全自动私有图床搭建终极指南 (Worker + Hono 篇)
本方案的核心逻辑是：利用 Hono 的通配符路由，动态将你的自定义域名路径实时映射到 GitHub 私有仓库的相应路径。
------------------------------
## 📅 阶段一：环境与基础设施准备
在这个阶段，你需要准备好所有原材料。
## 1. GitHub 侧准备

* 创建私有仓库：在 GitHub 创建一个新仓库，可见性（Visibility）必须勾选 Private。这个仓库将作为你的图片数据库。
* 生成访问令牌 (PAT)：
* 进入个人设置 (Settings) -> 开发者设置 (Developer settings) -> Tokens (classic)。
   * 生成一个新 Token，勾选 repo 权限（允许读取私有仓库文件）。
   * 关键细节：复制并安全保存该 Token，它只会显示一次。

## 2. Cloudflare 侧准备

* 注册与登录：准备好一个 Cloudflare 账号。
* 域名托管（强烈建议）：将你的个人域名（如 yourdomain.com）的 DNS 解析交由 Cloudflare 托管。因为默认的 workers.dev 域名在国内部分网络环境下无法稳定访问。

## 3. 本地开发环境准备

* 确保本地安装了 Node.js（建议 LTS 版本）和 npm（或 pnpm/yarn）。
* 确保本地安装了 Git 并配置好了 GitHub 的 SSH 密钥，保证能流畅推送代码。

------------------------------
## 📅 阶段二：使用 Wrangler 初始化与本地开发
Wrangler 是 Cloudflare 官方的命令行工具。我们用它来本地初始化 Hono 项目并进行配置。
## 1. 初始化 Hono 项目

* 在本地终端运行 Cloudflare 的初始化命令，选择创建 Wrangler / Worker 项目。
* 在框架模板选项中，直接选择 Hono 模板。
* 选择使用 TypeScript 或 JavaScript（根据你的喜好，建议 TypeScript 体验更好）。
* 初始化完成后，进入项目文件夹，安装依赖。

## 2. 理解核心路由配置（不含具体代码）

* 打开项目中的入口主文件（通常是 src/index.ts 或 src/index.js）。
* 核心逻辑配置：
* 利用 Hono 的 /* 通配符路由捕获所有传入的 URL 请求。
   * 通过内置的请求对象，动态提取出用户访问的相对路径（例如：用户访问 ://img.com，路由需要提取出 /travel/pic.png）。
   * 使用 fetch 方法向 GitHub API 发送请求。请求的 URL 由 GitHub用户名 + 仓库名 + 刚才提取的动态路径 拼接而成。
   * 细节处理：必须在 Fetch 的 Request Headers 中加入 Authorization: token <你的Token>，同时加入特定 Header 告诉 GitHub ：“我需要原始的二进制文件，不要 Base64 编码”。
   * MIME 类型映射：根据动态路径的后缀（.png / .jpg / .webp），在返回的 Response Headers 中指定正确的 Content-Type，否则浏览器会以文件下载形式打开图片，而不是直接显示。
   * 缓存优化：在返回的 Header 中加入 Cache-Control（如设置缓存一周）。这样同一张图片第二次访问时，Cloudflare 会直接从边缘节点缓存返回，不再消耗 GitHub API 额度，且加载速度达到毫秒级。

## 3. 本地配置文件修改 (wrangler.toml)

* 打开项目根目录下的 wrangler.toml 文件。
* 在 [vars] 模块下，配置非敏感的环境变量：
* GITHUB_USER = "你的GitHub用户名"
   * GITHUB_REPO = "你的私有图床仓库名"
* 注意：不要把 GitHub Token 写在这个文件里，它属于敏感信息，需要在后续的线上后台或通过命令行加密上传。

------------------------------
## 📅 阶段三：部署与线上配置
项目在本地写好动态映射逻辑后，需要一键推送到 Cloudflare 边缘网络。
## 1. 首次部署

* 在本地终端执行 npx wrangler deploy。
* 如果是第一次使用，终端会弹窗提示登录 Cloudflare 账号，授权即可。
* 部署成功后，终端会输出一个默认的控制台访问地址和 *.workers.dev 域名。

## 2. 注入隐私密钥（Token）

* 为了安全，GitHub Token 必须作为“加密变量（Secret）”存入 Cloudflare。
* 操作方式：在终端运行 npx wrangler secret put GITHUB_TOKEN，随后在提示中粘贴你第一步生成的 GitHub Token。
* （也可以在 Cloudflare 网页后台 -> 你的 Worker 项目 -> Settings -> Variables 中进行添加并点击 Encrypt）。

## 3. 绑定自定义域名（关键步骤）

* 登录 Cloudflare 网页后台，进入该 Worker 项目。
* 点击 Settings -> Domains & Routes -> Add Custom Domain。
* 输入你准备好的三级域名（例如 ://yourdomain.com），确认绑定。Cloudflare 会自动帮你配置好 SSL 证书和路由映射。

------------------------------
## 📅 阶段四：日常使用与自动化上传工作流
整个通道打通后，你未来每天的传图和用图流程将变得极度丝滑。
## 1. 结构完全同步

* 你在 GitHub 私有仓库里的目录结构，就是你最终的图片 URL 结构。
* 例如，你在仓库根目录下创建了文件夹 2026/05/，里面放了 hello.jpg。
* 那么这张图的公网唯一访问路径就是：https://yourdomain.com。

## 2. 配合客户端（如 PicGo）实现快捷键上传
如果你写博客或笔记，不可能每次都手动去 GitHub 网页端上传。可以通过配置 PicGo 实现“截图 -> 上传 -> 自动生成 URL”。

* 配置 PicGo 的 GitHub 图床参数：
* 仓库名、分支（main）、Token 都填写你自己的真实私库信息。
   * 核心细节：自定义域名（Custom Border URL） 处，不要填写 GitHub 默认的，而是填写你绑定给 Cloudflare Worker 的域名：https://yourdomain.com。
* 最终效果：PicGo 会利用 Token 默默把图片推送到你的私库，但由于你配置了自定义域名，它最终吐给你的 Markdown 链接会自动变成你的 Worker 域名。

------------------------------
## 📅 阶段五：后期维护与额度监控

* 流量监控：Cloudflare Worker 免费版每天提供 10 万次 请求额度。由于我们配置了 Cache-Control 缓存，只有当缓存失效或者新图片首次被访问时才会消耗 Worker 请求和 GitHub API 额度，个人使用完全绰绰有余。
* 容量注意：GitHub 单个仓库建议不要超过 1GB-5GB。如果几年后图片实在是太多了，你只需要在 GitHub 重新开一个私库（如 my-images-v2），然后去 Cloudflare 后台把环境变量中的 GITHUB_REPO 改掉即可，Worker 代码不需要动一个字。


