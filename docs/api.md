你说得对！让我重新提供代码，这次我会分段展示，方便你复制：

1. 基础Python API调用类
import json
import urllib.request
import urllib.parse
import uuid
import requests
import time

class ComfyUIAPI:
    def __init__(self, server_address="127.0.0.1:8188"):
        self.server_address = server_address
        self.client_id = str(uuid.uuid4())
    
    def queue_prompt(self, prompt):
        """提交生成任务到队列"""
        p = {"prompt": prompt, "client_id": self.client_id}
        data = json.dumps(p).encode('utf-8')
        req = urllib.request.Request(f"http://{self.server_address}/prompt", data=data)
        return json.loads(urllib.request.urlopen(req).read())
    
    def get_image(self, filename, subfolder, folder_type):
        """获取生成的图像"""
        data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url_values = urllib.parse.urlencode(data)
        with urllib.request.urlopen(f"http://{self.server_address}/view?{url_values}") as response:
            return response.read()
    
    def get_history(self, prompt_id):
        """获取任务历史"""
        with urllib.request.urlopen(f"http://{self.server_address}/history/{prompt_id}") as response:
            return json.loads(response.read())
2. 基础工作流模板
def create_basic_workflow(prompt_text, negative_prompt="worst quality", width=512, height=512, steps=20, seed=42):
    """创建基本的工作流程"""
    workflow = {
        "3": {
            "inputs": {
                "seed": seed,
                "steps": steps,
                "cfg": 8.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            },
            "class_type": "KSampler"
        },
        "4": {
            "inputs": {
                "ckpt_name": "v1-5-pruned-emaonly.ckpt"  # 替换为你的模型文件名
            },
            "class_type": "CheckpointLoaderSimple"
        },
        "5": {
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1
            },
            "class_type": "EmptyLatentImage"
        },
        "6": {
            "inputs": {
                "text": prompt_text,
                "clip": ["4", 1]
            },
            "class_type": "CLIPTextEncode"
        },
        "7": {
            "inputs": {
                "text": negative_prompt,
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
                "filename_prefix": "ComfyUI_API",
                "images": ["8", 0]
            },
            "class_type": "SaveImage"
        }
    }
    return workflow
3. 简化的客户端类
class SimpleComfyUIClient:
    def __init__(self, base_url="http://localhost:8188"):
        self.base_url = base_url
        self.api = ComfyUIAPI()
        
    def generate_image(self, prompt, negative_prompt="worst quality", width=512, height=512, steps=20):
        """生成图像的简单接口"""
        # 创建工作流
        workflow = create_basic_workflow(prompt, negative_prompt, width, height, steps)
        
        # 提交任务
        result = self.api.queue_prompt(workflow)
        prompt_id = result['prompt_id']
        print(f"任务已提交，ID: {prompt_id}")
        
        # 等待完成
        return self.wait_for_completion(prompt_id)
    
    def wait_for_completion(self, prompt_id, timeout=300):
        """等待任务完成"""
        start_time = time.time()
        print("等待生成完成...")
        
        while time.time() - start_time < timeout:
            try:
                history = self.api.get_history(prompt_id)
                if prompt_id in history:
                    print("生成完成！")
                    return history[prompt_id]
                time.sleep(2)
            except Exception as e:
                print(f"检查状态时出错: {e}")
                time.sleep(2)
        
        raise TimeoutError(f"任务超时 ({timeout}秒)")
    
    def save_images_from_result(self, result, output_dir="./output"):
        """从结果中保存图像"""
        import os
        os.makedirs(output_dir, exist_ok=True)
        
        outputs = result.get('outputs', {})
        saved_files = []
        
        for node_id, output in outputs.items():
            if 'images' in output:
                for i, image_info in enumerate(output['images']):
                    image_data = self.api.get_image(
                        image_info['filename'],
                        image_info.get('subfolder', ''),
                        image_info.get('type', 'output')
                    )
                    
                    filename = f"{output_dir}/{image_info['filename']}"
                    with open(filename, "wb") as f:
                        f.write(image_data)
                    
                    saved_files.append(filename)
                    print(f"图像已保存: {filename}")
        
        return saved_files
4. 使用示例
# 初始化客户端
client = SimpleComfyUIClient("http://localhost:8188")

# 生成图像
try:
    result = client.generate_image(
        prompt="a beautiful sunset over mountains, masterpiece, high quality",
        negative_prompt="worst quality, low quality, blurry",
        width=512,
        height=512,
        steps=20
    )
    
    # 保存图像
    saved_files = client.save_images_from_result(result)
    print(f"成功生成并保存了 {len(saved_files)} 张图像")
    
except Exception as e:
    print(f"生成失败: {e}")
5. curl命令示例
# 提交工作流
curl -X POST http://localhost:8188/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": {
      "3": {
        "inputs": {
          "seed": 42,
          "steps": 20,
          "cfg": 8.0,
          "sampler_name": "euler",
          "scheduler": "normal",
          "denoise": 1.0,
          "model": ["4", 0],
          "positive": ["6", 0],
          "negative": ["7", 0],
          "latent_image": ["5", 0]
        },
        "class_type": "KSampler"
      },
      "4": {
        "inputs": {"ckpt_name": "v1-5-pruned-emaonly.ckpt"},
        "class_type": "CheckpointLoaderSimple"
      },
      "5": {
        "inputs": {"width": 512, "height": 512, "batch_size": 1},
        "class_type": "EmptyLatentImage"
      },
      "6": {
        "inputs": {"text": "a cat", "clip": ["4", 1]},
        "class_type": "CLIPTextEncode"
      },
      "7": {
        "inputs": {"text": "worst quality", "clip": ["4", 1]},
        "class_type": "CLIPTextEncode"
      },
      "8": {
        "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        "class_type": "VAEDecode"
      },
      "9": {
        "inputs": {"filename_prefix": "curl_test", "images": ["8", 0]},
        "class_type": "SaveImage"
      }
    },
    "client_id": "curl_client"
  }'
6. 获取队列状态
# 查看队列
curl http://localhost:8188/queue

# 查看历史（替换PROMPT_ID）
curl http://localhost:8188/history/PROMPT_ID

# 下载图像（替换参数）
curl "http://localhost:8188/view?filename=FILENAME&type=output" --output image.png
现在你可以分别复制每个代码块了！记得要：

确保ComfyUI正在运行在 http://localhost:8188
将模型文件名替换为你实际拥有的模型
根据需要调整提示词和参数