

    let comments = []; // 全域宣告所有留言資料
    
    // 先讀取原始留言資料
    // 使用 PapaParse 讀取多個 worksheet（mainComments, replys）
    // 需先將 comments.xlsx 轉成 CSV 格式的多個 sheet，或用 xlsx.js 先解析
    fetch('comments.xlsx')
        .then(res => res.arrayBuffer())
        .then(arrayBuffer => {
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
            // 取得 mainComments 與 replys 兩個工作表
            const mainCSV = XLSX.utils.sheet_to_csv(workbook.Sheets["mainComments"]);
            const replyCSV = XLSX.utils.sheet_to_csv(workbook.Sheets["replys"]);

            // 解析 mainComments 留言資料
            Papa.parse(mainCSV, {
                header: true,
                complete: function (mainResult) {
                    const raw = mainResult.data;
                    comments = raw.map(row => ({
                        id: row.id,
                        name: row.name,
                        text: row.text,
                        time: row.time,
                        avatar: row.avatar,
                        likes: Number(row.likes),
                        replies: []
                    }));

                    // 解析 replys 回覆資料
                    Papa.parse(replyCSV, {
                        header: true,
                        complete: function (replyResult) {
                            const replyRaw = replyResult.data;
                            replyRaw.forEach(reply => {
                                const target = comments.find(c => c.id === reply.commentId);
                                if (target) {
                                    target.replies.push({
                                        name: reply.name,
                                        text: reply.text,
                                        time: reply.time,
                                        avatar: reply.avatar,
                                        likes: Number(reply.likes)
                                    });
                                }
                            });
                            
                            // 合併 localStorage 中新的「我的留言」
                            myComments = JSON.parse(localStorage.getItem('myComments') || '[]');
                            if (myComments.length > 0) {
                                comments = comments.concat(myComments);
                            }

                            // 只在資料載入完成後才渲染與綁定事件
                            renderComments();
                            document.querySelectorAll("input[type=checkbox], select").forEach(el => {
                                el.addEventListener("change", renderComments);
                            });
                        }
                    });
                }
            });
        });
    ;
    
    const commentSection = document.getElementById("commentSection")

    function renderComments() {
        
        commentSection.innerHTML = "";
        // 清空 commentSection 以便重新渲染

        // 篩選條件，將勾選的條件應用到 filteredComments 上
        const filterAt = document.getElementById("filterAt").checked;
        const filterShort = document.getElementById("filterShort").checked;
        const filterUser = document.getElementById("filterUser").checked;
        const sortType = document.getElementById("sortSelect").value;

        let filteredComments = comments.filter(c => {
            if (filterAt && c.text.includes("@")) return false;
            if (filterShort && c.text.length < 5) return false;
            if (filterUser && c.name === "小明") return false;
            return true;
        });

        // 依照要求排序 filteredComments
        if (sortType === "newest") {
            filteredComments.sort((a, b) => new Date(b.time) - new Date(a.time));
        } else if (sortType === "oldest") {
            filteredComments.sort((a, b) => new Date(a.time) - new Date(b.time));
        } else if (sortType === "likes") {
            filteredComments.sort((a, b) => b.likes - a.likes);
        }

        // 渲染主留言
        filteredComments.forEach((comment,index) => {

            // 檢查 localStorage
            
            // 每個留言只能有一個「讚」狀態，使用 comment.id 作為 key
            // 合併 localStorage 讚 狀態
            const liked = localStorage.getItem('liked_' + comment.id);

            // 合併 新留言 的部分已在 fetch 中處理
            // 合併 localStorage 新回覆
            const savedReplies = localStorage.getItem('replies_' + comment.id);
            if (savedReplies) {
                comment.replies = JSON.parse(savedReplies);
            }

            const div = document.createElement("div");
            // 根據留言者名稱添加樣式
            // 如果是「你」，則添加 my-comment 樣式，不然添加 comment 樣式
            div.className =  comment.name === "你" ? " my-comment" : "comment";

            div.innerHTML = `
                    <div class="avatar">${comment.avatar}</div> 
                    <div class="comment-body">
                        <div class="comment-name">${comment.name}</div> 
                        <div class="comment-time">${comment.time}</div> 
                        <div class="comment-text">${comment.text}</div> 
                        <div class="comment-actions">
                            <span class="like-btn${liked ? ' liked' : ''}" data-index="${index}">
                            👍 ${comment.likes}
                            </span>
                            <span class="reply-btn" data-index="${index}">回覆</span>
                        </div>
                    </div>
                    `;
            commentSection.appendChild(div);

            // 展開/收合按鈕
            const toggleBtn = document.createElement("div");
            toggleBtn.className = "toggle-replies";
            toggleBtn.textContent = comment.replies?.length > 0 ? "▶ 查看回覆（" + comment.replies.length + "）" : "";
            toggleBtn.dataset.index = index;
            commentSection.appendChild(toggleBtn);

            // 選染回覆區
            const replyContainer = document.createElement("div");
            // 檢查 localStorage 中是否有展開的回覆 ID
            // 如果有，則展開對應的回覆區
            const openRepliesId = localStorage.getItem('openReplies');
            replyContainer.className = "replies-container" + ((openRepliesId == comment.id) ? "" : " collapsed");
            
            replyContainer.id = `replies-${index}`;

            comment.replies?.forEach(reply => {
                const replyDiv = document.createElement("div");
                // 根據回覆者名稱添加樣式
                // 如果是「你」，則添加 my-reply 樣式，不然添加 comment-reply 樣式
                replyDiv.className = reply.name === "你" ? " my-reply" : "comment-reply";
                replyDiv.innerHTML = `
                    <div class="avatar">${reply.avatar}</div>
                    <div class="comment-body">
                        <div class="comment-name">${reply.name}</div>
                        <div class="comment-time">${reply.time}</div>
                        <div class="comment-text">${reply.text}</div>
                        <div class="comment-actions"><span>👍 ${reply.likes}</span></div>
                    </div>
                `;
                replyContainer.appendChild(replyDiv);
            });

            commentSection.appendChild(replyContainer);

            // 回覆輸入區（隱藏，點回覆才出現）
            const replyBox = document.createElement("div");
            replyBox.className = "comment-reply-box";
            replyBox.innerHTML = `
                <textarea placeholder="輸入你的回覆…" id="reply-text-${index}"></textarea><br>
                <button data-index="${index}">送出回覆</button>
            `;
            replyBox.style.display = "none";
            commentSection.appendChild(replyBox);
        });

        // 新增「我的留言」輸入區
        const myCommentBox = document.createElement("div");
        myCommentBox.className = "my-comment";
        myCommentBox.style.marginTop = "20px";
        myCommentBox.innerHTML = `
            <div class="avatar">🧑</div>
            <div class="comment-body">
                <textarea id="myCommentInput" placeholder="輸入你的留言…"></textarea><br>
                <button id="myCommentBtn">送出留言</button>
            </div>
        `;
        commentSection.appendChild(myCommentBox);
        
        // 綁定「讚」按鈕點擊事件
        document.querySelectorAll(".like-btn").forEach(btn => {
            btn.addEventListener("click", () => {
            const i = btn.dataset.index;
            const commentId = filteredComments[i].id;
            const originIndex = comments.findIndex(c => c.id === commentId);
            if (originIndex !== -1) {
                if (!localStorage.getItem('liked_' + commentId)) {
                // 按讚
                localStorage.setItem('liked_' + commentId, '1');
                comments[originIndex].likes++;
            } else {
                // 取消讚
                localStorage.removeItem('liked_' + commentId);
                if (comments[originIndex].likes > 0) {
                    comments[originIndex].likes--;
                }
            }
            renderComments();
                }
            });
        });

        // 綁定「回覆」按鈕點擊 → 顯示輸入區
        document.querySelectorAll(".reply-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const i = btn.dataset.index;
                const replyBox = document.getElementById(`reply-text-${ i }`).parentElement;
                replyBox.style.display = replyBox.style.display === "none" ? "block" : "none";
            });
        });

        // 綁定事件：送出「我的」回覆
        document.querySelectorAll(".comment-reply-box button").forEach(btn => {
            btn.addEventListener("click", () => {
                const i = btn.dataset.index;
                const textarea = document.getElementById(`reply-text-${i}`);
                const text = textarea.value.trim();
                if (text.length > 0) {
                    
                    //  新增回覆
                    comments[i].replies.push({
                        name: "你",
                        text: text,
                        time: new Date().toLocaleString(),
                        avatar: "🧑",
                        likes: 0
                    });
                    // 儲存到 localStorage
                    localStorage.setItem('replies_' + comments[i].id, JSON.stringify(comments[i].replies));
                    // 記錄展開狀態
                    localStorage.setItem('openReplies', comments[i].id);
                    renderComments();
                }
            });
        });

        // 綁定事件：展開/收合回覆
        document.querySelectorAll(".toggle-replies").forEach(toggle => {
            toggle.addEventListener("click", () => {
                const i = toggle.dataset.index;
                const container = document.getElementById(`replies-${i}`);
                const isCollapsed = container.classList.contains("collapsed");
                container.classList.toggle("collapsed");
                if (!isCollapsed) {
                    localStorage.removeItem('openReplies');
                } else {
                    localStorage.setItem('openReplies', filteredComments[i].id);
                }
                toggle.textContent = isCollapsed ? "▼ 收合回覆" : `▶ 查看回覆（${comments[i].replies.length}）`;
            });
        });

        // 綁定送出 「我的留言」 事件
        document.getElementById("myCommentBtn").onclick = function() {
            const text = document.getElementById("myCommentInput").value.trim();
            if (text.length > 0) {
                // 新增主留言
                const myComment = {
                    id: "my_" + Date.now(),
                    name: "你",
                    text: text,
                    time: new Date().toLocaleString(),
                    avatar: "🧑",
                    likes: 0,
                    replies: []
                };
                comments.push(myComment);

                // 儲存到 localStorage
                let myComments = JSON.parse(localStorage.getItem('myComments') || '[]'); // 從 localStorage 取出 myComments，沒有的話就用空陣列，然後轉成 JS 陣列
                myComments.push(myComment); // 將新的留言加入到 myComments 陣列中
                localStorage.setItem('myComments', JSON.stringify(myComments)); // 將 myComments 陣列轉成 JSON 字串並存回 localStorage

                // 清空輸入框
                document.getElementById("myCommentInput").value = "";
                renderComments();
            }
        };
    }

    document.getElementById("resetBtn").addEventListener("click", () => {
    // 1. 清除 localStorage
    localStorage.clear();

    // 2. 取消所有篩選器
    document.getElementById("filterAt").checked = false;
    document.getElementById("filterShort").checked = false;
    document.getElementById("filterUser").checked = false;
    document.getElementById("sortSelect").value = "default";

    // 3. 重新載入留言資料（重新 fetch comments.xlsx）
    // 這裡直接重新整理頁面最簡單
    location.reload();
});