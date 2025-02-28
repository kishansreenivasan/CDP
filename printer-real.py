from escpos.printer import Usb
from PIL import Image

p = Usb(0x0483, 0x070b, 0, 0x81, 0x02)


def printText(text, align="left", bold=False):
    p.set(align=align, text_type=("B" if bold else "NORMAL"))
    p.text(text)


def printImage(img):
    im = Image.open(img)
   
    im = im.resize(
        (384, int(im.size[1] * (384 / im.size[0]))), Image.ANTIALIAS)
    
    if im.mode == "RGBA":
        for x in range(im.width):
            for y in range(im.height):
                if im.getpixel((x, y))[3] == 0:
                    im.putpixel((x, y), (255, 255, 255, 255))
    
    im = im.convert("L")
    im.save("temp.jpg")
    p.image("temp.jpg")

def line(n = 1):
    for i in range(n): printText("\n")

