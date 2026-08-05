# 马原毛概在线刷题

这是一个纯前端刷题网站，可以直接部署到 GitHub Pages。

## 已包含功能

- 毛概题库与马原题库切换
- 单选题和多选题
- 答案判断与详细解析
- 上一题、下一题、随机一题
- 题干、选项、来源和解析全文搜索
- 错题本
- 已答题数、正确数、正确率统计
- 35 秒与 60 秒限时练习
- 自定义 JSON 题库导入
- 学习记录导出与导入
- 响应式手机界面和深色模式

## 本地预览

由于浏览器安全限制，不要直接双击 `index.html`。请在项目目录运行一个本地服务器：

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

## 部署到 GitHub Pages

1. 在 GitHub 创建一个新仓库，例如 `quiz-web`。
2. 将本项目内的所有文件上传到仓库根目录。
3. 打开仓库的 `Settings`。
4. 点击左侧 `Pages`。
5. 在 `Build and deployment` 中：
   - Source：`Deploy from a branch`
   - Branch：`main`
   - Folder：`/ (root)`
6. 点击 `Save`。
7. 发布完成后访问：

```text
https://你的用户名.github.io/quiz-web/
```

## 自定义题库格式

```json
{
  "meta": {
    "title": "我的题库"
  },
  "questions": [
    {
      "id": "Q001",
      "type": "single",
      "question": "题目内容",
      "options": {
        "A": "选项 A",
        "B": "选项 B"
      },
      "answer": ["A"],
      "explanation": "答案解析",
      "source": "题目来源"
    }
  ]
}
```

多选题将 `type` 设为 `multiple`，答案写为多个字母：

```json
"answer": ["A", "C"]
```

## 数据保存说明

答题记录、错题本、自定义题库和主题设置均保存在浏览器 `localStorage` 中：

- 同一浏览器再次访问时会自动保留。
- 清理浏览器数据后可能丢失。
- 不同浏览器或不同设备不会自动同步。
- 建议定期使用“导出学习记录”备份。

## 项目结构

```text
quiz-github-pages/
├─ index.html
├─ style.css
├─ app.js
├─ README.md
├─ .gitignore
├─ .nojekyll
└─ data/
   ├─ maogai.json
   └─ mayuan.json
```
