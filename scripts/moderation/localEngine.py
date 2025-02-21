import os
if hasattr(os, 'nice'):
    os.nice(10)
from flask import Flask, request, jsonify
import torch
from transformers import AutoModelForImageClassification, AutoFeatureExtractor, AutoProcessor
from PIL import Image
import io

app = Flask(__name__)

loaded_models = {}

def download_model(model_name):
    model = AutoModelForImageClassification.from_pretrained(model_name)
    model.save_pretrained(f"./models/{model_name}")

    try:
        feature_extractor = AutoFeatureExtractor.from_pretrained(model_name)
        feature_extractor.save_pretrained(f"./models/{model_name}")
        print("Feature Extractor saved.")
    except:
        try:
            processor = AutoProcessor.from_pretrained(model_name)
            processor.save_pretrained(f"./models/{model_name}")
            print("Processor saved.")
        except Exception as e:
            print(f"Warning: No valid preprocessor found for {model_name}: {e}")

def load_model(model_name):
    model_path = f"./models/{model_name}"

    if model_name not in loaded_models:
        if not os.path.exists(model_path):
            download_model(model_name)

        model = AutoModelForImageClassification.from_pretrained(model_path)

        try:
            feature_extractor = AutoFeatureExtractor.from_pretrained(model_path)
        except:
            try:
                feature_extractor = AutoProcessor.from_pretrained(model_path)
            except Exception as e:
                raise RuntimeError(f"No valid preprocessor found for {model_name}: {e}")

        if torch.cuda.is_available():
            model.to('cuda')

        loaded_models[model_name] = (model, feature_extractor)
    
    return loaded_models[model_name]

def classify_image(model, feature_extractor, image_bytes):
    image = Image.open(io.BytesIO(image_bytes))

    inputs = feature_extractor(images=image, return_tensors="pt")

    if torch.cuda.is_available():
        inputs = {k: v.to('cuda') for k, v in inputs.items()}

    outputs = model(**inputs)
    logits = outputs.logits
    predicted_class_idx = logits.argmax(-1).item()

    return model.config.id2label[predicted_class_idx]

def get_model_classes(model_name):
    model, _ = load_model(model_name)
    return model.config.id2label

@app.route('/classify', methods=['POST'])
def classify():
    model_name = request.args.get('model_name')
    if not model_name:
        return jsonify({"error": "Model name is required"}), 400

    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        model, feature_extractor = load_model(model_name)
        image_bytes = file.read()
        label = classify_image(model, feature_extractor, image_bytes)
        return jsonify({"label": label}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/classes', methods=['GET'])
def model_classes():
    model_name = request.args.get('model_name')
    if not model_name:
        return jsonify({"error": "Model name is required"}), 400

    try:
        classes = get_model_classes(model_name)
        return jsonify(classes), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max image size

if __name__ == '__main__':
    os.makedirs("./models", exist_ok=True)
    app.run(host='127.0.0.1', port=3001)
