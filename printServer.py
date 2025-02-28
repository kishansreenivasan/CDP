import os
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename

# Import the printer library
import printer

app = Flask(__name__)

# Configure an upload folder where images will be saved
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/print', methods=['POST'])
def print_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image part in the request'}), 400

    image_file = request.files['image']

    if image_file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Secure the filename and construct a file path
    filename = secure_filename(image_file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    try:
        # Save the file to disk
        image_file.save(file_path)

        # Call the printer library's printImage method with the file path
        printer.printImage(file_path)

        return jsonify({'message': 'Image printed successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)

