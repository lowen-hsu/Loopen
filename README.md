# Loopen

> 把常用的，都收在這裡。

Loopen 是一個輕量、個人化的 Web App 收藏與啟動器。使用者可以建立分類、加入常用 Web App、搜尋、重新排序，並直接從首頁開啟常用工具。

## V1 功能

- 自訂分類
- 修改分類名稱
- 分類排序與儲存 / 取消
- 新增 Web App
- Web App 排序與儲存 / 取消
- 搜尋 Web App
- 新增成功與操作完成提示
- 自動使用網站 favicon（失敗時退回文字圖示）
- localStorage 本機保存
- 響應式桌面 / 手機介面

## 技術

V1 採用原生 HTML / CSS / JavaScript，不需要建置即可部署到 Vercel。

後續可將目前的 localStorage data layer 替換為 Firebase / Firestore，以支援登入與跨裝置同步。

## 本機執行

直接開啟 `index.html`，或使用任何靜態網站伺服器：

```bash
python3 -m http.server 5173
```

然後開啟 `http://localhost:5173`。
