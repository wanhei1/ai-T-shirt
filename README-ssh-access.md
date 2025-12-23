# 从零开始：如何为没有账户的用户申请并使用 SSH 公钥连接服务器

本说明面向“尚未在服务器上注册账户”的用户，说明如何：
- 在本地生成 SSH 密钥对（公钥 + 私钥）
- 检查并准备公钥
- 向服务器管理员/门户提交公钥以申请账户或把公钥加入你的账户
- 在管理员完成配置后连接服务器，并进行简单排查

## 适用对象（contract）
- 输入：一台可运行 ssh 的本地机器（Linux / macOS / Windows 10+ / Windows PowerShell）
- 输出：一份公钥（例如 `~/.ssh/id_ed25519.pub`），以及连接服务器所需的信息（用户名、主机名或 IP、端口）
- 成功条件：管理员将你的公钥加入到你在服务器上的 `~/.ssh/authorized_keys`，你可用 SSH 登录
- 错误模式：权限问题（Permission denied）、网络/防火墙阻断、管理员未配置密钥或配置错误

## 一、推荐的密钥类型与首选项
- 推荐使用 ed25519（更短、更快、更安全），若旧系统不支持，可使用 rsa（建议 3072 或 4096 位）。

## 二、在常见平台生成 SSH 密钥

### Linux / macOS（推荐）
打开终端，运行：

```bash
# 生成 ed25519（交互式，会提示保存路径与是否设置 passphrase）
ssh-keygen -t ed25519 -C "your_email@example.com"

# 如果想指定文件名（例如 id_ed25519_custom）
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_custom -C "your_email@example.com"
```

按提示输入（建议设置一个短密码短语 passphrase 以保护私钥）。生成后会得到两个文件：私钥（如 `~/.ssh/id_ed25519`）和公钥（如 `~/.ssh/id_ed25519.pub`）。

### Windows 10/11（PowerShell 内置 OpenSSH）
在 PowerShell 中：

```powershell
# 交互式生成（会提示路径和 passphrase）
ssh-keygen -t ed25519 -C "your_email@example.com"
```

结果公钥默认在 `%USERPROFILE%\.ssh\id_ed25519.pub`。

如果使用 PuTTY (Windows) 则用 PuTTYgen 生成，并从 PuTTYgen 导出 OpenSSH 格式的公钥文本。

## 三、检查并复制公钥

查看公钥（以 ed25519 为例）：

```bash
cat ~/.ssh/id_ed25519.pub
```

公钥示例（一行）格式：

```
ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF... user@example.com
```

验证公钥指纹（便于管理员核对）：

```bash
ssh-keygen -lf ~/.ssh/id_ed25519.pub
# 或指定文件名
ssh-keygen -lf ~/.ssh/id_ed25519_custom.pub
```

将公钥完整（单行）复制并保存为纯文本，不要换行或添加注释（注释可以保留在行尾）。

## 四、如何提交公钥（三种常见方式）

1. 门户/控制台：很多公司/机构有用户管理门户，通常会有“添加 SSH 公钥”或“申请访问”的界面，直接粘贴公钥并填写用途/备注。
2. 工单/内部系统：在工单系统中提交请求并粘贴公钥，注明需要的主机和用户名。
3. 邮件给管理员：如果没有门户，用下列邮件模板（中文）发送给运维/管理员：

---
主题：申请服务器访问 — 添加 SSH 公钥

你好，

我需要访问服务器：
- 目标主机（或项目）：example-server.example.com
- 希望的用户名：myusername（若不确定，请由管理员创建）
- 访问用途：进行开发 / 部署 / 调试（简短说明）

我的 SSH 公钥如下（单行）：

```
ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF... user@example.com
```

公钥指纹（可选）：
```
SHA256:xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

若需要其它信息请告知。谢谢！

姓名：张三
邮箱：your_email@example.com
电话：+86-1XX-XXXX-XXXX

---

3. 若团队要求通过特定表单，请按表单指引提交。

## 五、管理员在服务器端需要做的事（给管理员的简要说明）
- 为用户创建系统账户（例如 `myusername`）。
- 在目标用户主目录下的 `~/.ssh/authorized_keys` 中添加你的公钥（单行一把）。
- 确保 `~/.ssh` 权限为 700，`~/.ssh/authorized_keys` 权限为 600，且文件属主为该用户。
- （可选）限制来源 IP、指定登录命令或生效的密钥选项以加强安全。

## 六、管理员完成后如何连接

假设管理员完成并给你以下信息：用户名 `myusername`，主机 `example-server.example.com`，端口 22（或其它端口）。

基本连接：

```bash
# 使用默认密钥（~/.ssh/id_ed25519）
ssh myusername@example-server.example.com

# 使用指定私钥文件
ssh -i ~/.ssh/id_ed25519_custom myusername@example-server.example.com

# 指定端口
ssh -p 2222 -i ~/.ssh/id_ed25519_custom myusername@example-server.example.com
```

首次连接时会提示接受服务器的 host key（指纹），请核对与管理员提供的 host key 指纹是否一致，确认后输入 yes。

## 七、常见问题排查

1. Permission denied (publickey)
   - 确认你使用的是与管理员登记一致的公钥对应的私钥。
   - 确认私钥权限为 600：`chmod 600 ~/.ssh/id_ed25519`。
   - 如果管理员未将公钥正确追加到 `authorized_keys` 或文件权限不对，会导致该错误。
   - 开启详细模式查看原因：`ssh -vvv myusername@host`。

2. Connection refused 或无法达通
   - 检查主机名/IP 是否正确，端口是否被公司防火墙/本地网络阻断。尝试 `telnet host port` 或 `nc -vz host port`。

3. Host key mismatch
   - 主机指纹发生变化时会警告，谨慎处理，可能是中间人攻击或服务器重装。与管理员核对指纹。

4. 公钥格式不对或多行被换行
   - 确认粘贴的是单行公钥，未包含多余换行或注释换行。

## 八、安全建议（必须知道的）
- 永远不要把私钥（`~/.ssh/id_ed25519`）发给别人。只共享公钥（以 `.pub` 结尾的文件）。
- 给私钥设置 passphrase，并使用 `ssh-agent` 管理会话。
- 私钥文件权限应为 600，`~/.ssh` 目录权限应为 700。
- 为不同服务使用不同密钥对（便于撤销与审计）。
- 当不再需要访问时，请管理员删除 `authorized_keys` 中对应的公钥或撤销账户；同时在本地删除相应私钥（谨慎）。

## 九、常用辅助命令小抄

```bash
# 显示公钥
cat ~/.ssh/id_ed25519.pub

# 检查公钥指纹
ssh-keygen -lf ~/.ssh/id_ed25519.pub

# 本地调试连接（详细模式）
ssh -vvv -i ~/.ssh/id_ed25519 myusername@host

# 如果已存在账号且可直接登录，用 ssh-copy-id 自动安装公钥（有账号密码）
ssh-copy-id -i ~/.ssh/id_ed25519.pub myusername@host

# 查看服务器端 authorized_keys
# （需要管理员权限或目标用户权限）
ssh myadmin@server 'cat /home/myusername/.ssh/authorized_keys'
```

## 十、示例流程（简短版）
1. 本地生成密钥：`ssh-keygen -t ed25519`
2. 复制 `~/.ssh/id_ed25519.pub` 内容
3. 通过门户/邮件/工单提交公钥并说明用途
4. 管理员创建账号并添加公钥
5. 使用 `ssh myusername@host` 连接并核对 host key

## 十一、有用的链接与参考
- OpenSSH manual: https://www.openssh.com/manual.html
- SSH 公钥格式解释: RFC 4253

---
如果你愿意，我可以：
- 把这份 README 加入仓库根（我已准备好写入文件）
- 根据你目标服务器的要求，把邮件模板改成更具体的版本（提供目标主机、项目名或者管理员联系人）

如需我把文件写入仓库，请回复“创建文件”，或告诉我你希望的文件名与路径。