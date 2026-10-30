# 发布流程

每次发布都产出一个 GitHub Release，正文来自 `CHANGELOG.md` 对应版本段落。仓库的更新日志和 Release 永远一致，不需要两处维护。

## 三步

1. **写日志**：在 `CHANGELOG.md` 顶部加一段 `## [X.Y.Z] — YYYY-MM-DD`，按「新增 / 变更 / 修复 / 文档」分组。
2. **改版本**：把 `package.json` 的 `version` 改成同一个版本号。
3. **跑脚本**：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version X.Y.Z
```

脚本会依次：

- 校验 `package.json` 版本和 `CHANGELOG.md` 段落一致、段落不为空
- 要求工作区干净（没提交就先提交）
- 跑 `check-composition.cjs` 和打包，任一失败就停
- 创建 annotated tag `vX.Y.Z`（已存在则复用）
- 推送 `main` 和 tag
- 用日志段落加署名创建 GitHub Release；已存在则更新

想先看效果：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Version X.Y.Z -DryRun
```

`-DryRun` 不推送、不建 Release，只打印脚本会发出的正文。

## 署名

**提交人固定是 DeepSeek**，不是仓库所有者。仓库本地的 git 身份已经设好：

```bash
git config user.name  "DeepSeek"
git config user.email "noreply@deepseek.com"
```

所有提交（作者和提交人）都记到这个名字下。GitHub 上没有 `deepseek.com` 邮箱的账号，所以提交会显示为未验证、无头像链接——这是预期行为，不是配置错误。

Release 正文只由日志段落组成，不加额外的署名行。

## 版本号怎么定

- **主版本**：破坏性变更（老版本 DSH 装不上、配置字段被删、行为语义变了）
- **次版本**：新增能力（新技能、新契约、新工具）
- **修订号**：修 bug、文档、内部整理

## 手动兜底

脚本某一步失败、又想单独发 Release 时：

```bash
gh release create vX.Y.Z --title vX.Y.Z --notes-file release-notes.md
```

正文同样从 `CHANGELOG.md` 抄，别另写一份。
