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
