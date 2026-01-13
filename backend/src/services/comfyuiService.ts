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
