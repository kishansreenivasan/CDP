from PIL import Image

def printImage(path):
   img = Image.open(path)
   img.show()
