"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { ArrowLeft, ArrowRight, Palette, Check } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

const tshirtStyles = [
  {
    id: "classic",
    name: "Classic Fit",
    description: "Comfortable everyday wear",
    price: 24.99,
    image: "/classic-fit-t-shirt-mockup.jpg",
  },
  {
    id: "slim",
    name: "Slim Fit",
    description: "Modern tailored silhouette",
    price: 26.99,
    image: "/slim-fit-t-shirt-mockup.jpg",
  },
  {
    id: "oversized",
    name: "Oversized",
    description: "Relaxed streetwear style",
    price: 28.99,
    image: "/oversized-t-shirt-mockup.jpg",
  },
]

const colors = [
  { id: "white", name: "White", hex: "#FFFFFF", border: true },
  { id: "black", name: "Black", hex: "#000000" },
  { id: "navy", name: "Navy", hex: "#1E3A8A" },
  { id: "gray", name: "Gray", hex: "#6B7280" },
  { id: "red", name: "Red", hex: "#DC2626" },
  { id: "green", name: "Green", hex: "#059669" },
  { id: "blue", name: "Blue", hex: "#2563EB" },
  { id: "purple", name: "Purple", hex: "#7C3AED" },
]

const sizes = ["XS", "S", "M", "L", "XL", "XXL"]

export default function DesignPage() {
  const router = useRouter()
  const [selectedStyle, setSelectedStyle] = useState("classic")
  const [selectedColor, setSelectedColor] = useState("white")
  const [selectedSize, setSelectedSize] = useState("M")

  const selectedStyleData = tshirtStyles.find((style) => style.id === selectedStyle)

  const handleContinueToEditor = () => {
    // Store selections in localStorage or pass as URL params
    const selections = {
      style: selectedStyle,
      color: selectedColor,
      size: selectedSize,
      price: selectedStyleData?.price,
    }
    localStorage.setItem("tshirtSelections", JSON.stringify(selections))
    router.push("/design/editor")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Palette className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">CustomTee</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Step 1 of 3</Badge>
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
              <span className="font-medium">Choose Product</span>
            </div>
            <div className="w-8 h-px bg-border"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-muted text-muted-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                2
              </div>
              <span className="text-muted-foreground">Design</span>
            </div>
            <div className="w-8 h-px bg-border"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-muted text-muted-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                3
              </div>
              <span className="text-muted-foreground">Review</span>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Choose Your T-Shirt</h1>
            <p className="text-xl text-muted-foreground">Select your preferred style, color, and size to get started</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Product Preview */}
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <div className="aspect-square bg-muted rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                    <img
                      src={selectedStyleData?.image || "/placeholder.svg"}
                      alt={selectedStyleData?.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold mb-2">{selectedStyleData?.name}</h3>
                    <p className="text-muted-foreground mb-4">{selectedStyleData?.description}</p>
                    <div className="text-2xl font-bold text-primary">${selectedStyleData?.price}</div>
                  </div>
                </CardContent>
              </Card>

              {/* Selected Options Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Your Selection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Style:</span>
                    <span className="font-medium">{selectedStyleData?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Color:</span>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: colors.find((c) => c.id === selectedColor)?.hex }}
                      />
                      <span className="font-medium">{colors.find((c) => c.id === selectedColor)?.name}</span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size:</span>
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
                  <CardTitle>Style</CardTitle>
                  <CardDescription>Choose your preferred fit</CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={selectedStyle} onValueChange={setSelectedStyle}>
                    <div className="grid gap-4">
                      {tshirtStyles.map((style) => (
                        <div key={style.id} className="flex items-center space-x-3">
                          <RadioGroupItem value={style.id} id={style.id} />
                          <Label htmlFor={style.id} className="flex-1 cursor-pointer">
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium">{style.name}</div>
                                <div className="text-sm text-muted-foreground">{style.description}</div>
                              </div>
                              <div className="font-semibold">${style.price}</div>
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
                  <CardTitle>Color</CardTitle>
                  <CardDescription>Pick your favorite color</CardDescription>
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
                        title={color.name}
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
                  <CardTitle>Size</CardTitle>
                  <CardDescription>Select your size</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {sizes.map((size) => (
                      <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        className={`py-3 px-4 rounded-lg border-2 font-medium transition-all hover:bg-muted ${
                          selectedSize === size ? "border-primary bg-primary/5 text-primary" : "border-border"
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Continue Button */}
              <Button size="lg" onClick={handleContinueToEditor} className="w-full text-lg">
                Continue to Design Editor
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
