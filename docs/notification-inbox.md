# Notification inbox and push routing

The bell opens the persistent `member_notifications` inbox. A push tap opens the same inbox on web and in the packaged app. Each saved item then opens one supported destination: `map`, `wall`, `messages`, `meetups`, or `nudges`. Message items may also carry `chat=live`, or `chat=scheduled` with a UUID `post_id`. URLs supplied by a notification are never opened directly.

New server-side streams can queue a `welcome_push`, `meetup_push`, or `friend_push` job in `private.notification_jobs` with a unique `event_key`, `user_id`, and a payload containing `title`, `text`, and `route`. The database trigger saves the inbox item. The push dispatcher sends `route=notifications` to OneSignal, so the same installed binary can display future streams that use the existing destination values. Adding a new app screen or destination still requires a client update. Chat and friend nudges also save inbox items when push is disabled.

The installed binary needs this inbox update once. Production also needs the versioned migrations, the web/server deployment, a valid OneSignal App API key in `ONESIGNAL_API_KEY`, and a real subscribed-device test. The key belongs only on the server. A queued job or a passing local test does not prove device delivery.
