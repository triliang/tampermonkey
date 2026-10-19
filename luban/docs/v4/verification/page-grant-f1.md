# F1：失败定位

状态：完成。原失败会话 `9a67171e-282f-4d3c-a44b-8dd55da5273f`，问题“都有哪些广告模块”。领域仅有 run.started/run.finished，失败约 6.5 秒，不符合超时；模型 Key 未变更。

只读检查原检查点写入的 `__error__`，结果为 `{"message":"PAGE_NOT_GRANTED","name":"Error"}`。模型尝试 read_page_context，但该会话未绑定授权页面；工具权限边界拒绝访问，异常直接终止 SDK 调用，Bridge 又将全部聊天异常归为统一模型失败文案。

验收：检查点错误码与该会话无 page.bound 事件相互吻合。定位完成，不删除原历史或重置模型配置。
