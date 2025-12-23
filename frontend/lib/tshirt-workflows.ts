/**
 * 针对 T 恤设计的专用工作流模板
 */

import { type GenerationParams, type Workflow } from "./comfyui-client"

export interface TShirtDesignParams extends Omit<GenerationParams, 'prompt'> {
  prompt?: string
  designType?: 'graphic' | 'text' | 'pattern' | 'illustration'
  placement?: 'center' | 'top' | 'bottom' | 'left' | 'right'
  backgroundColor?: 'transparent' | 'white' | 'black'
}

/**
 * 创建 T 恤图形设计工作流
 */
export function createTShirtGraphicWorkflow(params: TShirtDesignParams): Workflow {
  const {
    prompt,
    negativePrompt = "text, watermark, low quality, blurry, background",
    width = 512,
    height = 512,
    steps = 20,
    seed = Math.floor(Math.random() * 1000000),
    cfgScale = 8.0,
    samplerName = "euler",
    scheduler = "normal",
    modelName = "v1-5-pruned-emaonly.ckpt",
    designType = 'graphic',
    placement = 'center',
    backgroundColor = 'transparent'
  } = params

  // 根据设计类型和位置调整提示词
  let enhancedPrompt = prompt
  
  if (designType === 'graphic') {
    enhancedPrompt += ", vector art, clean design, bold graphics"
  } else if (designType === 'illustration') {
    enhancedPrompt += ", detailed illustration, artistic design"
  } else if (designType === 'pattern') {
    enhancedPrompt += ", repeating pattern, seamless design"
  }

  if (backgroundColor === 'transparent') {
    enhancedPrompt += ", transparent background, isolated design"
  }

  enhancedPrompt += ", T-shirt design, printable, high contrast, suitable for apparel"

  return {
    "3": {
      inputs: {
        seed,
        steps,
        cfg: cfgScale,
        sampler_name: samplerName,
        scheduler,
        denoise: 1.0,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0]
      },
      class_type: "KSampler"
    },
    "4": {
      inputs: {
        ckpt_name: modelName
      },
      class_type: "CheckpointLoaderSimple"
    },
    "5": {
      inputs: {
        width,
        height,
        batch_size: 1
      },
      class_type: "EmptyLatentImage"
    },
    "6": {
      inputs: {
        text: enhancedPrompt,
        clip: ["4", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "7": {
      inputs: {
        text: negativePrompt,
        clip: ["4", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "8": {
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2]
      },
      class_type: "VAEDecode"
    },
    "9": {
      inputs: {
        filename_prefix: `tshirt_${designType}_${placement}`,
        images: ["8", 0]
      },
      class_type: "SaveImage"
    }
  }
}

/**
 * 创建高质量 SDXL 工作流
 */
export function createSDXLTShirtWorkflow(params: TShirtDesignParams): Workflow {
  const {
    prompt,
    negativePrompt = "text, watermark, low quality, blurry, background, cropped",
    width = 1024,
    height = 1024,
    steps = 25,
    seed = Math.floor(Math.random() * 1000000),
    cfgScale = 7.0,
    designType = 'graphic',
    backgroundColor = 'transparent'
  } = params

  let enhancedPrompt = `${prompt}, T-shirt design, vector style, clean design, high quality, printable`
  
  if (designType === 'graphic') {
    enhancedPrompt += ", bold graphics, modern design"
  }

  if (backgroundColor === 'transparent') {
    enhancedPrompt += ", white background, isolated subject"
  }

  return {
    "4": {
      inputs: {
        ckpt_name: "sd_xl_base_1.0.safetensors"
      },
      class_type: "CheckpointLoaderSimple"
    },
    "5": {
      inputs: {
        width,
        height,
        batch_size: 1
      },
      class_type: "EmptyLatentImage"
    },
    "6": {
      inputs: {
        text: enhancedPrompt,
        clip: ["4", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "7": {
      inputs: {
        text: negativePrompt,
        clip: ["4", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "10": {
      inputs: {
        add_noise: "enable",
        noise_seed: seed,
        steps,
        cfg: cfgScale,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        start_at_step: 0,
        end_at_step: 10000,
        return_with_leftover_noise: "disable",
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0]
      },
      class_type: "KSamplerAdvanced"
    },
    "8": {
      inputs: {
        samples: ["10", 0],
        vae: ["4", 2]
      },
      class_type: "VAEDecode"
    },
    "9": {
      inputs: {
        filename_prefix: `tshirt_sdxl_${designType}`,
        images: ["8", 0]
      },
      class_type: "SaveImage"
    }
  }
}

/**
 * 样式预设配置
 */
export const tshirtStylePresets: Record<string, Omit<TShirtDesignParams, 'prompt'>> = {
  'minimalist-graphic': {
    designType: 'graphic',
    placement: 'center',
    backgroundColor: 'transparent',
    steps: 15,
    cfgScale: 6.0,
    samplerName: "euler",
    scheduler: "normal"
  },
  'detailed-illustration': {
    designType: 'illustration',
    placement: 'center',
    backgroundColor: 'transparent',
    steps: 30,
    cfgScale: 8.5,
    samplerName: "dpmpp_2m",
    scheduler: "karras"
  },
  'cartoon-character': {
    designType: 'illustration',
    placement: 'center',
    backgroundColor: 'white',
    steps: 20,
    cfgScale: 8.0,
    samplerName: "euler",
    scheduler: "normal"
  },
  'vintage-logo': {
    designType: 'graphic',
    placement: 'center',
    backgroundColor: 'transparent',
    steps: 25,
    cfgScale: 7.5,
    samplerName: "dpmpp_2m",
    scheduler: "karras"
  },
  'abstract-pattern': {
    designType: 'pattern',
    placement: 'center',
    backgroundColor: 'transparent',
    steps: 20,
    cfgScale: 9.0,
    samplerName: "euler_ancestral",
    scheduler: "normal"
  }
}

/**
 * 根据用户选择的风格获取预设参数
 */
export function getTShirtStylePreset(style: string): Omit<TShirtDesignParams, 'prompt'> {
  return tshirtStylePresets[style] || tshirtStylePresets['minimalist-graphic']
}