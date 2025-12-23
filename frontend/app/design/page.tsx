"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Palette, Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { useLanguage } from "@/contexts/language-context";

const tshirtStyles = [
  {
    id: "classic",
    name: { zh: "经典版型", en: "Classic Fit" },
    description: { zh: "舒适百搭的日常穿着", en: "Comfortable everyday wear" },
    price: 24.99,
    image: "/classic-fit-t-shirt-mockup.jpg",
  },
  {
    id: "slim",
    name: { zh: "修身版型", en: "Slim Fit" },
    description: { zh: "现代感剪裁造型", en: "Modern tailored silhouette" },
    price: 26.99,
    image: "/slim-fit-t-shirt-mockup.jpg",
  },
  {
    id: "oversized",
    name: { zh: "宽松版型", en: "Oversized" },
    description: { zh: "随性街头风格", en: "Relaxed streetwear style" },
    price: 28.99,
    image: "/oversized-t-shirt-mockup.jpg",
  },
];

const colors = [
  { id: "white", name: { zh: "白色", en: "White" }, hex: "#FFFFFF", border: true },
  { id: "black", name: { zh: "黑色", en: "Black" }, hex: "#000000" },
  { id: "navy", name: { zh: "海军蓝", en: "Navy" }, hex: "#1E3A8A" },
  { id: "gray", name: { zh: "灰色", en: "Gray" }, hex: "#6B7280" },
  { id: "red", name: { zh: "红色", en: "Red" }, hex: "#DC2626" },
  { id: "green", name: { zh: "绿色", en: "Green" }, hex: "#059669" },
  { id: "blue", name: { zh: "蓝色", en: "Blue" }, hex: "#2563EB" },
  { id: "purple", name: { zh: "紫色", en: "Purple" }, hex: "#7C3AED" },
];

const sizes = ["XS", "S", "M", "L", "XL", "XXL"];

export default function DesignPage() {
  const router = useRouter();
  const { translate } = useLanguage();
  const [selectedStyle, setSelectedStyle] = useState("classic");
  const [selectedColor, setSelectedColor] = useState("white");
  const [selectedSize, setSelectedSize] = useState("M");

  const selectedStyleData = tshirtStyles.find(
    (style) => style.id === selectedStyle
  );
  const selectedColorData = colors.find((color) => color.id === selectedColor);

  const handleContinueToEditor = () => {
    // Store selections in localStorage or pass as URL params
    const selections = {
      style: selectedStyle,
      color: selectedColor,
      size: selectedSize,
      price: selectedStyleData?.price,
    };
    localStorage.setItem("tshirtSelections", JSON.stringify(selections));
    router.push("/design/editor");
  };

  return (
    <AuthGuard requireAuth={false}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  {translate({ zh: "返回", en: "Back" })}
                </Link>
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Palette className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold text-foreground">
                  {translate({ zh: "yituai", en: "yituai" })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {translate({ zh: "第 1 步 / 共 3 步", en: "Step 1 of 3" })}
              </Badge>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8">
          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                  1
                </div>
                <span className="font-medium">
                  {translate({ zh: "选择款式", en: "Choose Product" })}
                </span>
              </div>
              <div className="w-8 h-px bg-border"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-muted text-muted-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                  2
                </div>
                <span className="text-muted-foreground">
                  {translate({ zh: "设计", en: "Design" })}
                </span>
              </div>
              <div className="w-8 h-px bg-border"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-muted text-muted-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                  3
                </div>
                <span className="text-muted-foreground">
                  {translate({ zh: "预览", en: "Review" })}
                </span>
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                {translate({ zh: "选择你的 T 恤", en: "Choose Your T-Shirt" })}
              </h1>
              <p className="text-xl text-muted-foreground">
                {translate({
                  zh: "选择喜欢的版型、颜色与尺码，即刻开始设计",
                  en: "Select your preferred style, color, and size to get started",
                })}
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Product Preview */}
              <div className="space-y-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="aspect-square bg-muted rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                      <img
                        src={selectedStyleData?.image || "/placeholder.svg"}
                        alt={
                          selectedStyleData
                            ? translate(selectedStyleData.name)
                            : undefined
                        }
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-semibold mb-2">
                        {selectedStyleData
                          ? translate(selectedStyleData.name)
                          : ""}
                      </h3>
                      <p className="text-muted-foreground mb-4">
                        {selectedStyleData
                          ? translate(selectedStyleData.description)
                          : ""}
                      </p>
                      <div className="text-2xl font-bold text-primary">
                        ${selectedStyleData?.price}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Selected Options Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {translate({ zh: "当前选择", en: "Your Selection" })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {translate({ zh: "版型：", en: "Style:" })}
                      </span>
                      <span className="font-medium">
                        {selectedStyleData
                          ? translate(selectedStyleData.name)
                          : ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {translate({ zh: "颜色：", en: "Color:" })}
                      </span>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full border"
                          style={{
                            backgroundColor: selectedColorData?.hex,
                          }}
                        />
                        <span className="font-medium">
                          {selectedColorData
                            ? translate(selectedColorData.name)
                            : ""}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {translate({ zh: "尺码：", en: "Size:" })}
                      </span>
                      <span className="font-medium">{selectedSize}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Selection Options */}
              <div className="space-y-8">
                {/* Style Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {translate({ zh: "版型", en: "Style" })}
                    </CardTitle>
                    <CardDescription>
                      {translate({
                        zh: "选择你喜欢的版型",
                        en: "Choose your preferred fit",
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup
                      value={selectedStyle}
                      onValueChange={setSelectedStyle}
                    >
                      <div className="grid gap-4">
                        {tshirtStyles.map((style) => (
                          <div
                            key={style.id}
                            className="flex items-center space-x-3"
                          >
                            <RadioGroupItem value={style.id} id={style.id} />
                            <Label
                              htmlFor={style.id}
                              className="flex-1 cursor-pointer"
                            >
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="font-medium">
                                    {translate(style.name)}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {translate(style.description)}
                                  </div>
                                </div>
                                <div className="font-semibold">
                                  ${style.price}
                                </div>
                              </div>
                            </Label>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>

                {/* Color Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {translate({ zh: "颜色", en: "Color" })}
                    </CardTitle>
                    <CardDescription>
                      {translate({
                        zh: "选择你喜欢的颜色",
                        en: "Pick your favorite color",
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-3">
                      {colors.map((color) => (
                        <button
                          key={color.id}
                          onClick={() => setSelectedColor(color.id)}
                          className={`relative w-12 h-12 rounded-lg border-2 transition-all hover:scale-105 ${
                            selectedColor === color.id
                              ? "border-primary ring-2 ring-primary/20"
                              : color.border
                              ? "border-border"
                              : "border-transparent"
                          }`}
                          style={{ backgroundColor: color.hex }}
                          title={translate(color.name)}
                        >
                          {selectedColor === color.id && (
                            <Check className="w-4 h-4 absolute inset-0 m-auto text-white drop-shadow-sm" />
                          )}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Size Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {translate({ zh: "尺码", en: "Size" })}
                    </CardTitle>
                    <CardDescription>
                      {translate({ zh: "选择合适的尺寸", en: "Select your size" })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-3">
                      {sizes.map((size) => (
                        <button
                          key={size}
                          onClick={() => setSelectedSize(size)}
                          className={`py-3 px-4 rounded-lg border-2 font-medium transition-all hover:bg-muted ${
                            selectedSize === size
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border"
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Continue Button */}
                <Button
                  size="lg"
                  onClick={handleContinueToEditor}
                  className="w-full text-lg"
                >
                  {translate({
                    zh: "前往设计编辑器",
                    en: "Continue to Design Editor",
                  })}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
