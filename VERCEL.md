# Vercel 部署步骤（手把手 · 免费）

> Vercel Hobby（免费版）：个人项目免费、静态站点无限量、每月 100GB 带宽。
> 超额不会自动扣费，只会要求你升级。
>
> 部署完成后，**你的电脑可以关机**，手机和任何人都能通过网址打开这个应用。

---

## 方式 A：Vercel 网页版（推荐，最简单）

1. 打开 <https://vercel.com> → 点 **Continue with GitHub** → 用 `hqing0850-sudo` 登录
   （会请求 GitHub 授权，同意即可，**不会**公开你的仓库）

2. 点 **Add New...** → **Project** → 找到 **`my-ai-wardrobe`**（在你的仓库列表里）→ 点 **Import**
   - Framework Preset 会自动识别成 **Vite**
   - Build Command 自动填好 `npm run build`
   - Output Directory 自动填好 `dist`
   - 都不用改

3. 点 **Deploy**
   - 第一次会编译 1～2 分钟
   - 完成后会显示两个网址：
     - **Production**: `https://my-ai-wardrobe.vercel.app` ← **这个就是给别人用的网址**
     - Preview: `https://my-ai-wardrobe-xxx.vercel.app`

4. 打开那个 `vercel.app` 网址，能看到衣橱界面就成功了

---

## 方式 B：命令行（我已经准备好了）

如果你想用命令行，在 **CMD** 里运行：

```cmd
cd "C:\Users\41634\Desktop\新建文件夹 (3)\my-ai-wardrobe" && npx vercel --prod --yes
```

第一次会要求登录（浏览器授权），之后会自动部署。

---

## 部署后要配的东西

### 1. 加上 Supabase 的环境变量（让数据存云端）

Vercel 项目页 → **Settings** → **Environment Variables** → 加两个：

| Key | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 的 Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase 的 anon / publishable key |

⚠️ **只能填 anon / publishable key**，绝对不能填 `service_role`。

加完点 **Deployments** 旁边的 **Redeploy**（重新部署一次才会生效）。

> 也可以不在 Vercel 配环境变量，直接在应用的「设置 → 云端同步」页面里填，
> 两种方式效果一样。前者适合以后换手机、换电脑时不用重填。

### 2. 验证「关掉电脑手机也能用」

1. 手机浏览器打开 `https://my-ai-wardrobe.vercel.app`
2. 注册一个账号（如果还没配 Supabase，这一步先跳过）
3. 添加一件衣服
4. **把电脑关机**
5. 手机刷新页面 → 衣服还在 ✓

### 3. 加到手机桌面

Chrome 打开网址 → 右上角 `⋮` → **添加到主屏幕 / 安装应用**
→ 桌面出现「我的衣橱」图标 → 点开是全屏无地址栏，和原生 App 几乎一样

---

## 免费额度对照（2026 年现行）

| 服务 | 免费额度 | 会不会自动扣费 |
| --- | --- | --- |
| **Vercel Hobby** | 静态站点无限量、100GB/月带宽 | **不会**，超额只要求升级 |
| **Supabase Free** | 数据库 500MB、存储 1GB、5GB/月出网、5万月活 | **不会**，超额暂停项目 |
| **GitHub** | 私有仓库无限量 | 不会 |

**合计成本：0 元。** 你的项目规模（几十到几千件衣服）远在免费额度内。

---

## 常见问题

**Q：部署后打开是空白页？**
A：检查环境变量是否加了并**重新部署**；再看 Vercel 的 Deployments 日志里有没有红色报错。

**Q：手机上打开没有「添加到主屏幕」？**
A：必须是 **https** 地址（Vercel 自带 https ✓）；用 Chrome 打开才有这个选项，微信内置浏览器没有。

**Q：别人打开我的网址，能看到我的衣服吗？**
A：**不能**。每个账号的数据由数据库的行级安全策略隔离，别人看不到你的。
（这正是我们要先验证隔离、再公开发布的原因。）

**Q：网址能改成自己的吗？**
A：可以，在 Vercel 项目页 **Settings → Domains** 里添加自定义域名，免费。
