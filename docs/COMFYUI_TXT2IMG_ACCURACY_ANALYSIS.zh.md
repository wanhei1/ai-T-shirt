# ComfyUI 文生图“提示词不准/跑偏”的原因分析（结合本仓库代码）

> 现象：你在 ComfyUI 文生图时经常觉得“生不出准确的图片”，例如输入类似“文字天空”，却容易生成房子/草地等看似无关的内容，整体准确率较低。你目前主要是直接运行 `ComfyUI/main.py`，担心是不是有别的模块没有运行到。

本分析基于你仓库里的 ComfyUI 代码实现 + 官方/模型卡公开信息，尽量把原因落到“链路哪里会弱化提示词/为什么模型会忽略它/缺少哪些能力模块”，并给出可验证的自查方法。

---

## 结论先说（最可能的 3 个根因）

1) **中文提示词（尤其短词/无空格）在 SD1.5/SDXL 这类 CLIP 文本编码体系下，本身就更容易“语义不稳/指令弱”，导致模型更多采样出训练先验（常见风景：房子、草地、天空等）。**

2) **“文字天空”这类需求如果你期望生成“可读文字/准确字符”，属于扩散类文生图模型的典型短板**（很多模型卡会直接写明“不能生成可读文字”），因此容易出现“像文字但不可读的纹理”，甚至直接跑偏。

3) **你只运行 `main.py` 并不会导致 ComfyUI 的文生图核心模块缺失**：`main.py` 会启动服务、加载核心节点（包括 CLIPTextEncode / KSampler / VAE 解码等）。准确率问题更大概率来自 **所用模型 + 提示词语言/表达方式 + 工作流参数/节点组合**，而不是“漏跑了某个 python 文件”。

---

## 1. 你只运行 `main.py` 是否会漏掉关键模块？

### 1.1 `main.py` 的实际作用

`ComfyUI/main.py` 做了这些关键事情：

- 设置路径与模型目录（`apply_custom_paths()` 会注册 checkpoints/clip/vae 等目录）
- 执行自定义节点的 prestartup（如果 `custom_nodes/*/prestartup_script.py` 存在）
- 启动执行器/队列与 Web/API 服务（`execution` + `server`）

换句话说：**文生图核心流程就在 `main.py` 拉起的服务里**。

> 相关代码：
> - `ComfyUI/main.py`：`apply_custom_paths()`、`execute_prestartup_script()`、import `execution` / `server` / `nodes`

### 1.2 什么时候会“像漏跑模块一样”导致效果异常？

通常不是漏跑 Python 文件，而是下面这些：

- 你期望使用某些能力（例如 ControlNet / IP-Adapter / 中文增强节点 / Prompt 处理节点），但这些**要么需要你在工作流里接入节点**，要么需要安装/启用自定义节点。
- 你使用了 API 方式提交 prompt，但提交的 workflow JSON **没有把你的文本写进正确的 `CLIPTextEncode` 节点**（常见于复用别人 workflow 时 node id 变化）。

本仓库里 `basicapi-example.py` 就是典型的“默认工作流 API 格式”，其中正向提示词位于节点 id `6`：

- `basicapi-example.py`：`prompt["6"]["inputs"]["text"] = "..."`

如果你实际用的 workflow 不是默认的（node id 不同），**你改错 key 就等于没改 prompt**，模型会继续用旧 prompt 生成，看起来就会“完全不听话”。

---

## 2. 提示词在代码里如何变成“条件”（conditioning）？哪里会变弱？

### 2.1 文本编码节点：`CLIPTextEncode`

在 ComfyUI 核心节点里，文本→条件主要通过：

- `ComfyUI/nodes.py` 的 `CLIPTextEncode.encode()`：
  - `tokens = clip.tokenize(text)`
  - `clip.encode_from_tokens_scheduled(tokens)`

这说明：**提示词的“可控性”高度依赖 text encoder（CLIP/T5/...）对该语言/表达的理解能力**。

### 2.2 以 SD1.x / SDXL 为例：tokenizer 与 77 token 限制

SD1.x 的 tokenizer 在：

- `ComfyUI/comfy/sd1_clip.py`：`class SDTokenizer` 使用 `transformers.CLIPTokenizer`，并且默认 `max_length=77`

在 `SDTokenizer.tokenize_with_weights()` 中，有明确的“分批/截断”逻辑：

- 当 `len(t_group) + len(batch) > self.max_length - has_end_token` 时，会把 token 分到下一批或填充。

这意味着：

- **提示词并不是“无限长”**；长提示词会拆成多个 section。
- 对中文这种“没有空格天然分词”的输入，往往更容易出现：
  - token 粒度不符合语义边界
  - 有效语义被稀释
  - 同一概念在 embedding 空间里不稳定

> 关键代码位置：
> - `ComfyUI/comfy/sd1_clip.py`：`SDTokenizer.__init__(max_length=77)`
> - `ComfyUI/comfy/sd1_clip.py`：`SDTokenizer.tokenize_with_weights()` 的分批逻辑

### 2.3 SDXL：两个文本编码器，但依然可能不擅长“可读文字”

本仓库的 SDXL 实现显示 SDXL 会用两套 encoder：

- `ComfyUI/comfy/sdxl_clip.py`：`SDXLClipModel` 同时包含 `clip_l` 和 `clip_g`

但这并不自动解决“生成可读文字”的问题。

公开模型卡里，SDXL Base 1.0 就明确写了限制：

- HuggingFace 模型卡（stabilityai/stable-diffusion-xl-base-1.0）Limitations：
  - **The model cannot render legible text**

因此如果你的“文字天空”是指“天空中出现清晰可读的汉字/英文”，那么即便提示词理解正确，**生成端也很可能做不到**。

---

## 3. 为什么会生成“房子草地”等训练先验？

这是扩散模型常见现象：当 conditioning 不够强/不够确定时，采样过程会更接近模型的高概率区域（也就是训练中最常见的图像分布）。

对你的例子“文字天空”，下面几类情况都会让 conditioning 变弱：

### 3.1 提示词语义太短/太歧义

“文字天空”可以被理解为：

- “有文字元素的天空”
- “天空主题的文字设计（海报/排版）”
- “文字 + 天空（两个概念并列）”

当概念不明确时，模型更容易采样出“天空/草地/房屋”这种常见的风景组合。

### 3.2 中文语义在 CLIP embedding 上不稳定

CLIP 的训练方式是“用互联网上的图文对”做对比学习（OpenAI 的 CLIP 介绍也强调它学习的是图文配对语义，并且对 wording/phrasing 敏感）。

- OpenAI CLIP 页面 Limitations 里提到：
  - **CLIP’s zero-shot classifiers can be sensitive to wording or phrasing**

对 SD1.5/SDXL 这条路线，实际使用的文本编码器通常对英文提示词更稳定；中文往往需要：

- 翻译到英文
- 或使用面向中文/多语言训练更充分的模型/文本编码器（例如 T5 系列、或专门中文微调的 SD 模型）

### 3.3 采样参数本身会影响“听不听话”

默认工作流里（见 `basicapi-example.py`）通常类似：

- steps = 20
- cfg = 8
- sampler = euler

对一些“抽象/组合/文字”类需求，steps/cfg 过低会更容易跑偏；但 cfg 过高又可能带来画面崩坏/过饱和。

> 相关代码：
> - `ComfyUI/nodes.py`：`KSampler` 的 `cfg/steps` 输入定义与 `common_ksampler()` 调用

---

## 4. 你到底“缺少什么模块”？

这里要分清两类：

- **ComfyUI 核心是否缺模块**（导致“该有的文生图没跑起来”）
- **你为了更准需要的能力模块**（不是 bug，而是能力/工具链缺口）

### 4.1 核心并不缺：默认文生图链路已经齐全

默认 API workflow（`basicapi-example.py`）就包含：

- `CheckpointLoaderSimple`（加载 model/clip/vae）
- `CLIPTextEncode`（正/负提示词）
- `EmptyLatentImage`
- `KSampler`
- `VAEDecode`
- `SaveImage`

你只运行 `main.py`，这些节点都会被加载。

### 4.2 你为了“更准确”可能缺的能力模块（需要额外接入/安装）

下面这些不是 ComfyUI core bug，而是“要提高可控性就得有”的常见模块：

1) **Prompt 预处理/翻译模块（中文→英文）**
   - ComfyUI core 的 `CLIPTextEncode` 不会帮你翻译。
   - 如果你主要用中文 prompt，建议加一个“翻译节点/脚本”作为前置。

2) **结构/约束类控制模块（强约束画面内容）**
   - ControlNet / T2I-Adapter / GLIGEN 等可以把“我要什么结构”钉住。
   - 否则仅靠短文本很难保证元素不跑偏。

3) **风格/概念注入模块（LoRA/embedding）**
   - 对特定概念（例如“天空文字海报风格”、“Typography in sky”），使用对应 LoRA 往往比纯 prompt 有效。

4) **如果你要“可读文字”，缺的不是一个节点，而是一条能力链**
   - 很多扩散模型明确写了“无法生成可读文字”。
   - 工程上通常做法是：先生成天空背景 → 再用排版/渲染把文字叠上去（或用专门的文字控制工作流）。

---

## 5. “哪里的代码有误/缺失什么代码”？更准确的说法

就你描述的“生成跑偏”，**从 core 代码逻辑上很难定性为 bug**，更像是：

- 设计上就没有“中文 prompt 自动增强/翻译/分词优化”的能力
- 模型本身（特别是 SD 系列）对“可读文字”能力不足

因此这里更合理的结论是：

- **缺失的不是“必须运行的模块”，而是“提升提示词可控性”的前处理与控制能力**。

不过，有一类“看起来像 bug”的情况你可以重点排查：

### 5.1 API 调用时 prompt 写错节点 id

如果你不是用 UI，而是用 API/workflow JSON：

- 只改了 `prompt["6"]["inputs"]["text"]` 但你的真实 workflow 里正向文本节点不是 `6`
- 或者你改的是负向 prompt

那么生成就会表现得“完全不听话”。

自查方法：

- 在 UI 里开启 dev mode，把 workflow 导出为 API 格式，确认正向 `CLIPTextEncode` 的 node id。

---

## 6. 模型层面对比（网上公开信息 + 和你的现象对应）

### 6.1 SDXL 相比 SD1.5：整体偏好更高，但仍不擅长可读文字

HuggingFace 的 SDXL Base 1.0 模型卡给出过用户偏好对比图，并指出：

- SDXL base 明显优于 SD 1.5/2.1（用户偏好）
- 但限制里明确写：
  - **cannot render legible text**
  - **struggles with compositionality**（复杂组合指令也仍困难）

因此：

- 如果你现在用的是 SD1.5 checkpoint，升级到 SDXL 往往能改善“整体理解与画质/偏好”。
- 但如果你的目标是“清晰可读文字”，升级 SDXL 也未必解决。

### 6.2 CLIP 的限制：对 wording/phrasing 敏感

OpenAI CLIP 页面在 Limitations 里提到：

- **sensitive to wording or phrasing**

这会放大“中文短词/歧义词”的不稳定性。

---

## 7. 建议的自查与定位步骤（不改代码也能验证根因）

1) **用同一个 seed，对比中文 vs 英文翻译提示词**
   - 如果英文显著更准，基本就锁定是“文本编码器对中文不稳”。

2) **确认你到底在用哪个 checkpoint**
   - 默认示例用的是 `v1-5-pruned-emaonly.ckpt`（SD1.5）。
   - SD1.5 更容易在抽象指令上跑偏。

3) **确认你的 prompt 是否真的进入了 `CLIPTextEncode`**
   - UI：看节点内容
   - API：确认 JSON node id 是否正确

4) **调整采样参数做 A/B 测试**
   - steps（例如 20→30/40）
   - cfg（例如 7→9/10）
   - 注意 cfg 过高会损画质或出现怪异结构

5) **如果目标是“可读文字”：把需求拆成两步**
   - 第一步生成“天空背景”
   - 第二步用图像编辑/排版把文字叠上去（工程上更可靠）

---

## 9. 我主要用中文：不强制翻译时，怎么把“准确率”拉上来？

你“主要用中文”这点非常关键：如果你当前用的是 SD1.5 / SDXL 这条 CLIP 文本编码路线（尤其是偏英文 caption 的 checkpoint），那么**不是 ComfyUI 的代码没跑到，而是文本编码器+训练数据对中文提示词的对齐程度有限**，表现就是“听不懂/听不准，然后回到训练先验（草地房子天空）”。

下面给你 3 条不依赖强制翻译、但能显著提升“中文可控性”的路径（按优先级从高到低）：

### 9.1 选“更擅长中文”的模型体系（根治思路）

ComfyUI 的核心加载逻辑（`comfy/sd.py -> load_state_dict_guess_config`）支持多种 text encoder 类型，不只有 CLIP。

如果你坚持中文提示词，建议优先选用：

- **原生中文/多语言训练充分的文生图模型**（通常在模型卡/介绍里会明确支持中文 prompt）
- **使用更强语言模型/更适配多语言的 text encoder** 的模型家族（例如基于 T5 / LLM / 多语言 tokenizer 的路线）

你仓库的 `ComfyUI/README.md` 已经列出支持的多种“非 SD1.5 的模型家族”（例如 Hunyuan、Qwen Image 等）。这些模型通常对中文指令的鲁棒性会比 SD1.5/纯 CLIP 更好。

> 自查：你现在到底是 SD1.5 / SDXL 还是别的？
> - 如果你工作流里用的是 `CheckpointLoaderSimple` 且加载 `v1-5-pruned-emaonly.ckpt` 这类文件，那么基本是 SD1.5。
> - SDXL 往往是 `sd_xl_base_1.0.safetensors` 一类。

### 9.2 同样用中文，但让“语义更可对齐”（工程写法，不算翻译）

很多“跑偏”来自提示词太短、太抽象、缺少约束。你可以保持中文，但把句式改成更“像训练 caption”的结构：

**推荐模板（中文为主）**

- 画面主体：`“天空中有巨大的文字形状云朵”`
- 形式约束：`“文字必须位于画面上半部分，居中，占画面宽度的70%”`
- 风格/摄影：`“写实摄影/广角/日落/高对比/超清”`
- 排除项：`“不要房子，不要草地，不要地平线，不要人物”`

把“概念词”扩成“可视化描述句”，往往比单独丢两个词（例如“文字天空”）更稳定。

另外，尽量避免只给 2~4 个字的抽象词；扩写到 1~2 句，模型更容易学到“你要的可视对象是什么”。

### 9.3 补齐“强约束模块”（不是必须运行的模块，而是提升可控性）

如果你希望画面必须包含某个结构（比如“文字在天空中以某种排版出现”），只靠 prompt 很难稳定。你需要在工作流里补齐约束分支：

- **ControlNet / T2I-Adapter**：用草图/边缘/深度等把结构钉住（否则模型会自由发挥）
- **LoRA**：加载“中文字效/海报排版/天空文字”相关的 LoRA，比纯 prompt 稳

这些模块不是 `main.py` 没跑到，而是你的工作流如果没接这些节点，就等于没有这些约束能力。

---

## 10. 你这个例子“文字天空”需要特别说明：它包含两个不同难点

1) **“文字”= 可读文字（汉字/英文清晰可读）**：
   - 许多扩散模型（包括 SDXL 模型卡）会明确写明“不能生成可读文字”，所以即便 prompt 对齐了也可能做不到。
   - 工程上更可靠的是：先生成天空背景，再用排版渲染把文字叠加（或者用专门的文字控制/编辑工作流）。

2) **“文字”= 文字形状/符号感（不要求可读）**：
   - 这个目标更可实现，但仍需要你把 prompt 写成“可视化描述句”，并用负向排除掉地面元素。


---

## 8. 如果你确实希望“从工程上补齐缺口”，通常要加什么

- 一个“中文 prompt 翻译/规范化”的前置模块（自定义节点或外部脚本）
- 或者直接换到 **对中文/多语言更友好的模型体系**（例如采用更强语言编码器的架构；ComfyUI 本身支持很多不同文本编码器类型）
- 若要强约束画面结构：在工作流里引入 ControlNet / GLIGEN 等控制分支

---

## 参考链接（公开信息）

- ComfyUI README（支持模型族与示例）：https://github.com/comfyanonymous/ComfyUI
- SDXL Base 1.0 模型卡（含限制：不能生成可读文字）：https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- OpenAI CLIP 介绍（含 wording/phrasing 敏感的限制说明）：https://openai.com/research/clip
