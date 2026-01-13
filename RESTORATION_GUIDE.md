# 项目功能恢复指南 (Project Restoration Guide)

由于服务器网络限制导致部分组件无法自动安装，且部分核心代码（AI生成服务）缺失。请按照以下步骤在本地准备文件，然后上传到服务器以恢复完整功能。

## 1. 恢复 ComfyUI Manager (插件管理器)

由于服务器无法连接 GitHub，请在您的本地电脑（能科学上网的环境）进行以下操作：

1.  **下载**: 访问 [https://github.com/ltdrdata/ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager) 点击 "Code" -> "Download ZIP"。
2.  **上传**: 将下载的 `ComfyUI-Manager-main.zip` 上传到服务器的 `/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/custom_nodes/` 目录。
3.  **解压**: 在服务器终端运行：
    ```bash
    cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI/custom_nodes/
    unzip ComfyUI-Manager-main.zip
    mv ComfyUI-Manager-main ComfyUI-Manager
    rm ComfyUI-Manager-main.zip
    ```
4.  **重启 ComfyUI**:
    ```bash
    tmux kill-session -t comfyui
    tmux new-session -d -s comfyui 'cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/ComfyUI && python3 main.py --force-fp32 --port 8188'
    ```

---

## 2. 恢复后端 AI 生成服务代码

后端缺少与 ComfyUI 通信的核心代码。请在服务器上创建以下文件。

### 2.1 创建 ComfyUI 服务类

**文件路径**: `/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/backend/src/services/comfyuiService.ts`

```typescript
import axios from 'axios';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const COMFYUI_HOST = process.env.COMFYUI_HOST || '127.0.0.1:8188';
// 确保图片保存目录存在
const OUTPUT_DIR = path.join(__dirname, '../../public/outputs');
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

export class ComfyUIService {
    private clientId: string;
    private ws: WebSocket | null = null;

    constructor() {
        this.clientId = randomUUID();
    }

    // 连接到 ComfyUI WebSocket
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                return resolve();
            }

            this.ws = new WebSocket(`ws://${COMFYUI_HOST}/ws?clientId=${this.clientId}`);

            this.ws.on('open', () => {
                console.log('Connected to ComfyUI WebSocket');
                resolve();
            });

            this.ws.on('error', (err) => {
                console.error('ComfyUI WebSocket error:', err);
                reject(err);
            });
        });
    }

    // 发送生成任务
    async queuePrompt(prompt: any): Promise<any> {
        await this.connect();

        try {
            const response = await axios.post(`http://${COMFYUI_HOST}/prompt`, {
                prompt,
                client_id: this.clientId
            });
            return response.data;
        } catch (error) {
            console.error('Error queuing prompt:', error);
            throw error;
        }
    }

    // 执行生成并等待结果
    async generateImage(workflow: any): Promise<string[]> {
        const promptResponse = await this.queuePrompt(workflow);
        const promptId = promptResponse.prompt_id;
        
        return new Promise((resolve, reject) => {
            if (!this.ws) return reject(new Error('WebSocket not initialized'));

            const handleMessage = (data: WebSocket.Data) => {
                const message = JSON.parse(data.toString());

                // 监听执行完成消息
                if (message.type === 'executing' && message.data.node === null && message.data.prompt_id === promptId) {
                    this.ws?.off('message', handleMessage);
                    
                    // 获取历史记录中的输出文件名
                    this.getHistory(promptId).then(history => {
                        const outputs = history[promptId].outputs;
                        const images: string[] = [];
                        
                        for (const nodeId in outputs) {
                            const nodeOutput = outputs[nodeId];
                            if (nodeOutput.images) {
                                for (const image of nodeOutput.images) {
                                    images.push(image.filename);
                                }
                            }
                        }
                        resolve(images);
                    }).catch(reject);
                }
            };

            this.ws.on('message', handleMessage);
            
            // 设置超时防止无限等待
            setTimeout(() => {
                this.ws?.off('message', handleMessage);
                reject(new Error('Generation timed out'));
            }, 300000); // 5分钟超时
        });
    }

    async getHistory(promptId: string): Promise<any> {
        const response = await axios.get(`http://${COMFYUI_HOST}/history/${promptId}`);
        return response.data;
    }
}
```

### 2.2 创建 AI 控制器

**文件路径**: `/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/backend/src/controllers/aiController.ts`

```typescript
import { Request, Response } from 'express';
import { ComfyUIService } from '../services/comfyuiService';

// 简单的 T-shirt 设计工作流模板 (JSON)
// 注意：实际使用时需要根据您的 ComfyUI 节点配置进行调整
const TSHIRT_WORKFLOW_TEMPLATE = {
  "3": {
    "inputs": {
      "seed": 0,
      "steps": 20,
      "cfg": 8,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler"
  },
  "4": {
    "inputs": {
      "ckpt_name": "v1-5-pruned-emaonly.ckpt"
    },
    "class_type": "CheckpointLoaderSimple"
  },
  "5": {
    "inputs": {
      "width": 512,
      "height": 512,
      "batch_size": 1
    },
    "class_type": "EmptyLatentImage"
  },
  "6": {
    "inputs": {
      "text": "t-shirt design, vector art, high quality",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode"
  },
  "7": {
    "inputs": {
      "text": "text, watermark, low quality",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode"
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["4", 2]
    },
    "class_type": "VAEDecode"
  },
  "9": {
    "inputs": {
      "filename_prefix": "tshirt_design",
      "images": ["8", 0]
    },
    "class_type": "SaveImage"
  }
};

export class AIController {
    private comfyService: ComfyUIService;

    constructor() {
        this.comfyService = new ComfyUIService();
    }

    async generateDesign(req: Request, res: Response) {
        try {
            const { prompt } = req.body;
            
            if (!prompt) {
                return res.status(400).json({ message: 'Prompt is required' });
            }

            // 复制模板并注入用户提示词
            const workflow = JSON.parse(JSON.stringify(TSHIRT_WORKFLOW_TEMPLATE));
            
            // 更新正向提示词 (Node 6)
            workflow["6"].inputs.text = `${prompt}, t-shirt design, vector style, white background, high quality`;
            
            // 更新随机种子 (Node 3)
            workflow["3"].inputs.seed = Math.floor(Math.random() * 1000000000);

            console.log('Starting generation for prompt:', prompt);
            const images = await this.comfyService.generateImage(workflow);

            // 构建完整的图片 URL
            // 假设 ComfyUI 和后端在同一台机器，或者通过反向代理访问
            // 这里返回的是 ComfyUI 的查看 URL
            const imageUrls = images.map(filename => 
                `http://api.bit810.cn/view?filename=${filename}&type=output`
            );

            res.json({ 
                message: 'Generation successful', 
                images: imageUrls 
            });

        } catch (error) {
            console.error('AI Generation error:', error);
            res.status(500).json({ message: 'Failed to generate design', error: String(error) });
        }
    }
}
```

### 2.3 注册路由

修改 `/usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/backend/src/routes/index.ts`，在 `createRoutes` 函数中添加：

```typescript
// 引入控制器
import { AIController } from '../controllers/aiController';

// ... 在 createRoutes 函数内部 ...

    const aiController = new AIController();

    // AI 生成路由
    router.post('/generate', authenticate, (req, res) => aiController.generateDesign(req, res));
```

## 3. 最后的步骤

完成上述文件创建后，请在后端目录运行：

```bash
cd /usrhome/tyx/.data/FUZHUANG/custom-tshirt-designer/backend
# 安装 WebSocket 依赖
npm install ws
npm install --save-dev @types/ws

# 重启后端
tmux kill-session -t cloth
tmux new-session -d -s cloth 'npm run dev'
```
