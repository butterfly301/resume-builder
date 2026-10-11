# 简历编辑器

固定模板的本地简历编辑与 PDF 导出程序。每份简历独立保存在 `data/resumes/<简历id>.json`，导出的 PDF 同时保存到 `exports`。

## 启动

双击 `start.bat`。首次运行会安装依赖并构建，随后自动打开浏览器。

开发模式：

```powershell
npm install
npm run dev
```

## 数据与导出

- 自动保存：编辑停止后写入 `data/resumes/<简历id>.json`
- 版本快照：保存在对应简历的 `snapshots` 字段
- PDF：浏览器下载一份，并保存到 `exports/姓名-岗位-手机号.pdf`
- 运行端口：默认 `4178`，可通过环境变量 `PORT` 修改
- 浏览器：默认使用本机 Edge，找不到时使用 Chrome；可通过 `RESUME_BROWSER_PATH` 指定可执行文件
