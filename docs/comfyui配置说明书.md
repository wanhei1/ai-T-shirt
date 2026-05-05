启动并设置开机自启：
systemctl --user enable --now comfyui

停止服务：
systemctl --user stop comfyui

重启服务：
systemctl --user restart comfyui

查看运行状态：
systemctl --user status comfyui

实时查看日志（非常重要）：
journalctl --user -u comfyui -f

服务依然保持常驻运行，您可以通过以下命令开启用户驻留：
loginctl enable-linger $USER