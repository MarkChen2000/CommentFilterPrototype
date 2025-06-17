

    let comments = []; // 全域宣告所有留言資料
    let aiFilteredIds = null; // 全域變數，存AI篩選結果
    
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
                        irrelevantTag: String(row.irrelevantTag).trim() === "1" ? 1 : 0, //無論是空字串、0、undefined 都會被視為 0，只有 "1" 會是 1。
                        image: row.image || "", // 如果沒有圖片則為空字串
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
                                        likes: Number(reply.likes),
                                        irrelevantTag: String(reply.irrelevantTag).trim() === "1" ? 1 : 0,
                                        image: reply.image || "" 
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
    
    // 取得排除名單
    function getExcludedNames() {
        return JSON.parse(localStorage.getItem('excludedNames') || '[]');
    }

    // 儲存排除名單
    function setExcludedNames(list) {
        localStorage.setItem('excludedNames', JSON.stringify(list));
    }

    // 渲染排除名單區塊
    function renderExcludedList() {
        let excludedList = getExcludedNames();
        let container = document.getElementById("excludedListContainer");
        if (!container) return;
        let isOpen = container.classList.contains("open");
        let html = `
            <div style="margin-bottom:8px;">
                <button id="toggleExcludedListBtn" style="font-size:0.95em;">
                    ${isOpen ? "▼" : "▶"} 排除名單 (${excludedList.length})
                </button>
            </div>
            <div id="excludedListPanel" style="display:${isOpen ? "block" : "none"}; margin-bottom:8px;">
                ${excludedList.length === 0 ? "<span style='color:gray;'>（無）</span>" : ""}
                ${excludedList.map(item => `
                    <span class="excluded-user">
                        <span class="avatar avatar-small">${item.avatar}</span>
                        ${item.name}
                        <button class="unexclude-btn" data-name="${item.name}">取消排除</button>
                    </span>
                `).join("")}
            </div>
        `;
        container.innerHTML = html;

        // 綁定開闔
        document.getElementById("toggleExcludedListBtn").onclick = function() {
            container.classList.toggle("open");
            renderExcludedList();
        };
        // 綁定排除名單中的 取消排除 按鈕
        container.querySelectorAll(".unexclude-btn").forEach(btn => {
            btn.onclick = function() {
                let name = btn.dataset.name;
                let list = getExcludedNames().filter(item => item.name !== name);
                setExcludedNames(list);
                renderComments();
                renderExcludedList();
            }
        });
    }

    // 頁面載入時先渲染一次
    renderExcludedList();

    const commentSection = document.getElementById("commentSection")

    function renderComments() {
        
        commentSection.innerHTML = "";
        // 清空 commentSection 以便重新渲染

        // 取得排除名單
        const excludedList = getExcludedNames();
        const excludedNames = excludedList.map(item => item.name);

        // 篩選條件，將勾選的條件應用到 filteredComments 上
        const filterAt = document.getElementById("filterAt").checked;
        const filterShort = document.getElementById("filterShort").checked;
        const filterIrrelevant = document.getElementById("filterIrrelevant").checked;

        // 篩選主留言
        let filteredComments = comments.filter(c => {
            if (filterAt && c.text.includes("@")) return false;
            if (filterShort && c.text.length < 10) return false;
            if (filterIrrelevant && c.irrelevantTag === 1) return false;
            // if (excludedNames.includes(c.name)) return false;

            // AI 篩選，只顯示符合條件的留言
            if (aiFilteredIds && !aiFilteredIds.includes(c.id)) return false;
            return true;
        });

        const sortType = document.getElementById("sortSelect").value;
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

            // 根據留言者名稱添加樣式
            const div = document.createElement("div");

            // 如果是被排除的名單：
            const isExcluded = excludedNames.includes(comment.name);
            if (isExcluded) {
                div.className = "excluded-comment";
                div.innerHTML = `
                    <div class="avatar">${comment.avatar}</div>
                    <div class="excluded-info">
                        <span class="excluded-name">${comment.name}</span>
                        <button class="unexclude-btn" data-name="${comment.name}">取消排除</button>
                    </div>
                `;
            }
            // 如果不是被排除的名單
            else { 
                // 如果是「你」，則添加 my-comment 樣式，不然添加 comment 樣式
                div.className =  comment.name === "你" ? " my-comment" : "comment";
                div.innerHTML = `
                    <div class="avatar">${comment.avatar}</div> 
                    <div class="comment-body">
                        <div class="comment-name">
                            ${comment.name}
                            <button class="exclude-btn" data-name="${comment.name}" data-avatar="${comment.avatar}">排除這個人</button>
                        </div>
                        <div class="comment-time">${comment.time}</div> 

                        <div class="comment-image">
                            ${comment.image ? `<img src="${comment.image}" class="comment-img" alt="留言圖片">` : ""}
                        </div>

                        <div class="comment-text">${comment.text}</div> 
                        <div class="comment-actions">
                            <span class="like-btn${liked ? ' liked' : ''}" data-index="${index}">
                            👍 ${comment.likes}
                            </span>
                            <span class="reply-btn" data-index="${index}">回覆</span>
                        </div>
                    </div>
                `;
            }
            
            commentSection.appendChild(div);
            
            //
            // 回覆區域：每個留言都可以有多個回覆
            
            // 先篩選出可見回覆
            const visibleReplies = (comment.replies || []).filter(reply => {
                if (filterAt && reply.text.includes("@")) return false;
                if (filterShort && reply.text.length < 10) return false;
                if (filterIrrelevant && reply.irrelevantTag === 1) return false;
                // if (excludedNames.includes(reply.name)) return false;
                return true;
            });

            // 展開/收合按鈕
            if (visibleReplies.length > 0) {
                const toggleBtn = document.createElement("div");
                toggleBtn.className = "toggle-replies";
                toggleBtn.textContent = `▶ 查看回覆（${visibleReplies.length}）`;
                toggleBtn.dataset.index = index;
                commentSection.appendChild(toggleBtn);
            }

            // 渲染回覆區
            const replyContainer = document.createElement("div");
            // 檢查 localStorage 中是否有展開的回覆 ID
            // 如果有，則展開對應的回覆區
            const openRepliesId = localStorage.getItem('openReplies');
            replyContainer.className = "replies-container" + ((openRepliesId == comment.id) ? "" : " collapsed");
            replyContainer.id = `replies-${index}`;

            visibleReplies?.forEach((reply, replyIndex) => {
                // 根據回覆者名稱添加樣式
                const replyDiv = document.createElement("div");

                // 如果是被排除的名單：
                const isReplyExcluded = excludedNames.includes(reply.name);
                if (isReplyExcluded) {
                    replyDiv.className = "excluded-reply";
                    replyDiv.innerHTML = `
                        <div class="avatar">${reply.avatar}</div>
                        <div class="excluded-info">
                            <span class="excluded-name">${reply.name}</span>
                            <button class="unexclude-btn" data-name="${reply.name}">取消排除</button>
                        </div>
                    `;
                }
                else {
                    // 如果是「你」，則添加 my-reply 樣式，不然添加 comment-reply 樣式
                    replyDiv.className = reply.name === "你" ? "my-reply" : "comment-reply";
                    replyDiv.innerHTML = `
                        <div class="avatar">${reply.avatar}</div>
                        <div class="comment-body">
                            <div class="comment-name">
                                ${reply.name}
                                <button class="exclude-btn" data-name="${reply.name}" data-avatar="${reply.avatar}">排除這個人</button>
                            </div>
                            <div class="comment-time">${reply.time}</div>

                            <div class="comment-image">
                                ${reply.image ? `<img src="${reply.image}" class="comment-img" alt="回覆圖片">` : ""}
                            </div>
                            
                            <div class="comment-text">${reply.text}</div>
                            <div class="comment-actions">
                                <span class="reply-like-btn" data-comment-index="${index}" data-reply-index="${replyIndex}">
                                    👍 ${reply.likes}
                                </span>
                            </div>
                        </div>
                    `;
                }
                replyContainer.appendChild(replyDiv);
            });

            commentSection.appendChild(replyContainer);

            // 回覆輸入區（隱藏，點回覆才出現）
            const replyBox = document.createElement("div");
            replyBox.className = "comment-reply-box";
            replyBox.id = `reply-box-${index}`;
            replyBox.innerHTML = `
                <div class="avatar">🧑</div>
                <div class="comment-body">
                    <textarea placeholder="輸入你的回覆…" id="reply-text-${index}"></textarea><br>
                    <button id="myReplyBtn" data-index="${index}">送出回覆</button>
                </div>
            `;
            replyBox.style.display = "none";
            commentSection.appendChild(replyBox);
        });

        // 顯示「我的留言」輸入區
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
        
        // 綁定主流言「讚」按鈕點擊事件
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

        // 綁定回覆的「讚」按鈕
        document.querySelectorAll(".reply-like-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const commentIdx = btn.dataset.commentIndex;
                const replyIdx = btn.dataset.replyIndex;
                const comment = filteredComments[commentIdx];
                const reply = (comment.replies || []).filter(reply => {
                    if (filterAt && reply.text.includes("@")) return false;
                    if (filterShort && reply.text.length < 10) return false;
                    if (filterIrrelevant && reply.irrelevantTag === 1) return false;
                    if (excludedNames.includes(reply.name)) return false;
                    return true;
                })[replyIdx];
                if (!reply) return;

                // localStorage key: liked_reply_{commentId}_{replyIdx}
                const key = `liked_reply_${comment.id}_${replyIdx}`;
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key, '1');
                    reply.likes++;
                } else {
                    localStorage.removeItem(key);
                    if (reply.likes > 0) reply.likes--;
                }
                // 儲存回覆到 localStorage
                localStorage.setItem('replies_' + comment.id, JSON.stringify(comment.replies));
                renderComments();
            });
        });

        // 綁定事件： 送出「我的」留言 
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

        // 綁定事件：送出「我的」回覆
        document.querySelectorAll(".comment-reply-box button").forEach(btn => {
            btn.addEventListener("click", () => {
                const i = btn.dataset.index;
                const textarea = document.getElementById(`reply-text-${i}`);
                const text = textarea.value.trim();
                if (text.length > 0) {
                    
                    // 用 filteredComments 找到正確的 comment id
                    const commentId = filteredComments[i].id;
                    // 再用 id 找到 comments 裡的原始留言
                    const originIndex = comments.findIndex(c => c.id === commentId);

                    if (originIndex === -1) return; // 如果找不到對應的留言，則不處理

                    //  新增回覆
                    comments[originIndex].replies.push({
                        name: "你",
                        text: text,
                        time: new Date().toLocaleString(),
                        avatar: "🧑",
                        likes: 0
                    });
                    // 儲存到 localStorage
                    localStorage.setItem('replies_' + comments[originIndex].id, JSON.stringify(comments[originIndex].replies));
                    // 記錄展開狀態
                    localStorage.setItem('openReplies', comments[originIndex].id);
                    textarea.value = ""; // 清空輸入框

                    renderComments();
                }
            });
        });

        // 綁定「回覆」按鈕點擊 → 顯示輸入區
        document.querySelectorAll(".reply-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const i = btn.dataset.index;
                const replyBox = document.getElementById(`reply-box-${ i }`);
                replyBox.style.display = replyBox.style.display === "none" ? "block" : "none";
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

        // 綁定排除留言中的取消排除按鈕
        document.querySelectorAll(".unexclude-btn").forEach(btn => {
            btn.onclick = function() {
                const name = btn.dataset.name;
                let list = getExcludedNames().filter(item => item.name !== name);
                setExcludedNames(list);
                renderComments();
                renderExcludedList();
            }
        });

        // 綁定留言中的「排除」按鈕
        document.querySelectorAll(".exclude-btn").forEach(btn => {
            btn.onclick = function() {
                const name = btn.dataset.name;
                const avatar = btn.dataset.avatar;
                let list = getExcludedNames();
                if (!list.some(item => item.name === name)) {
                    list.push({ name, avatar });
                    setExcludedNames(list);
                    renderComments();
                    renderExcludedList();
                }
            }
        });
    }

    // 重設、清除紀錄按鈕
    document.getElementById("resetBtn").addEventListener("click", () => {
        // 1. 清除 localStorage
        localStorage.clear();

        // 2. 取消所有篩選器
        document.getElementById("filterAt").checked = false;
        document.getElementById("filterShort").checked = false;
        document.getElementById("filterIrrelevant").checked = false;
        document.getElementById("sortSelect").value = "default";

        // 3. 重新載入留言資料（重新 fetch comments.xlsx）
        // 這裡直接重新整理頁面最簡單
        location.reload();
    });

    // AI 篩選功能
    document.getElementById("aiQueryBtn").onclick = function() {
        const query = document.getElementById("aiQueryInput").value.trim();
        if (!query) return;

        // 
        // AI 篩選：根據輸入的關鍵字過濾留言
        // 以後若要串接 AI 服務，可以在這裡實作
        // 目前簡單實作為關鍵字過濾
        // 
        // 只要留言內容包含輸入關鍵字就顯示
        aiFilteredIds = comments
            .filter(c => c.text && c.text.includes(query))
            .map(c => c.id);

        renderComments();
    };

    // AI 篩選重設按鈕
    document.getElementById("aiQueryResetBtn").onclick = function() {
        aiFilteredIds = null;
        document.getElementById("aiQueryInput").value = "";
        renderComments();
    };

    // 前往問卷填寫頁面
    document.getElementById("questionnaireBtn").onclick = function() {
        // 新增分頁方式
        window.open("https://docs.google.com/forms/d/e/1FAIpQLSd7cJl2mEun_MTnxM9zOQ_0WTw6lXGXDWNPMpkpM5p9Fnx8vg/viewform?usp=header", "_blank");
    };