import json
import os
from pathlib import Path

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request

from clearway_features import (FACTORS, FEATURES, MODEL_FILE, WEATHER_VARS, build_features, load_bundle,
                               risk_level)
from clearway_features import predict as model_predict  # app.py has its own predict(): the /predict route
from clearway_weather import weather_for_flight

ROOT = Path(__file__).parent
V2_PATH = ROOT / "models" / MODEL_FILE

app = Flask(__name__)

# v2 (schedule + weather) when trained; CLEARWAY_MODEL=v1 switches back to the original model.
USE_V2 = os.environ.get("CLEARWAY_MODEL", "v2") == "v2" and V2_PATH.exists()
if USE_V2:
    bundle = load_bundle(ROOT / "models")
    airports = json.loads((ROOT / "models" / "airports.json").read_text())
else:
    import joblib  # the original model needs scikit-learn (requirements-train.txt)
    v1_model = joblib.load(ROOT / "final_gradient_boosting_model.pkl")


@app.route("/api/health")  # "/" is the website itself on Vercel
def home():
    return f"Clearway backend is running (model {'v2' if USE_V2 else 'v1'})."


def predict_v1(carrier, origin, destination, date, dep_hour, arr_hour, elapsed_time, distance):
    day_of_week = date.dayofweek
    flight = pd.DataFrame([{
        "OP_UNIQUE_CARRIER": carrier, "ORIGIN": origin, "DEST": destination,
        "DEP_HOUR": dep_hour, "ARR_HOUR": arr_hour, "DAY_OF_WEEK": day_of_week,
        "IS_WEEKEND": 1 if day_of_week >= 5 else 0,
        "CRS_ELAPSED_TIME": elapsed_time, "DISTANCE": distance,
    }])
    return float(v1_model.predict_proba(flight)[0, 1]), 0.5, {"source": "not used"}, []


def explain(features):
    """The biggest factors behind one score, in percentage points.

    XGBoost splits the score (in log-odds) into one contribution per feature (SHAP values).
    A factor's effect is how far the score would move without that factor's contributions.
    """
    contribs = model_predict(bundle, features, pred_contribs=True)[0]
    total = contribs.sum()
    by_name = dict(zip(FEATURES, contribs[:-1]))
    sigmoid = lambda z: 1 / (1 + np.exp(-z))  # noqa: E731
    effects = []
    for factor, names in FACTORS.items():
        part = sum(by_name[n] for n in names)
        effects.append({"factor": factor, "effect": round(float(sigmoid(total) - sigmoid(total - part)) * 100, 1)})
    effects.sort(key=lambda e: abs(e["effect"]), reverse=True)
    return {"baseline": round(float(sigmoid(contribs[-1])) * 100, 1),
            "factors": [e for e in effects[:4] if abs(e["effect"]) >= 0.5]}


def predict_v2(carrier, origin, destination, date, dep_minutes, arr_minutes, elapsed_time, distance):
    weather, source = weather_for_flight(airports, origin, destination, date.date(), dep_minutes, arr_minutes)
    flight = pd.DataFrame([{
        "carrier": carrier, "origin": origin, "dest": destination, "flight_date": date,
        "dep_minutes": dep_minutes, "arr_minutes": arr_minutes,
        "elapsed_time": elapsed_time, "distance": distance, **weather,
    }])
    features = build_features(flight, bundle)
    probability = float(model_predict(bundle, features)[0])
    names = WEATHER_VARS.values()
    used = {"source": source}
    if weather:
        used["origin"] = {n: round(float(weather[f"o_{n}"]), 1) for n in names}
        used["destination"] = {n: round(float(weather[f"d_{n}"]), 1) for n in names}
    return probability, bundle["threshold"], used, explain(features)


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json()

        required_fields = [
            "carrier", "origin", "destination", "flight_date",
            "departure_time", "arrival_time", "elapsed_time", "distance",
        ]
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing field: {field}"}), 400

        carrier = data["carrier"].strip().upper()
        origin = data["origin"].strip().upper()
        destination = data["destination"].strip().upper()
        elapsed_time = float(data["elapsed_time"])
        distance = float(data["distance"])

        if not carrier or not origin or not destination:
            return jsonify({"error": "Carrier, origin and destination cannot be empty."}), 400

        try:
            date = pd.to_datetime(data["flight_date"], format="%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Invalid date. Use YYYY-MM-DD."}), 400

        try:
            dep_hour, dep_minute = (int(x) for x in data["departure_time"].split(":"))
            arr_hour, arr_minute = (int(x) for x in data["arrival_time"].split(":"))
            if not (0 <= dep_hour <= 23 and 0 <= dep_minute <= 59 and 0 <= arr_hour <= 23 and 0 <= arr_minute <= 59):
                raise ValueError
        except (ValueError, AttributeError):
            return jsonify({"error": "Invalid time. Use HH:MM."}), 400

        if elapsed_time <= 0:
            return jsonify({"error": "Elapsed time must be greater than 0."}), 400
        if distance <= 0:
            return jsonify({"error": "Distance must be greater than 0."}), 400

        if USE_V2:
            probability, threshold, weather, reasons = predict_v2(
                carrier, origin, destination, date,
                dep_hour * 60 + dep_minute, arr_hour * 60 + arr_minute, elapsed_time, distance)
        else:
            probability, threshold, weather, reasons = predict_v1(
                carrier, origin, destination, date, dep_hour, arr_hour, elapsed_time, distance)

        return jsonify({
            "prediction": "Significant Delay" if probability >= threshold else "No Significant Delay",
            # v1 scores run about twice too high, so its levels follow its own 50% cut-off.
            "risk_level": risk_level(probability) if USE_V2 else ("high" if probability >= 0.5 else "low"),
            "delay_probability": round(probability * 100, 2),
            "threshold": round(threshold * 100, 1),
            "model_version": "v2" if USE_V2 else "v1",
            "weather": weather,
            "reasons": reasons,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    # 5001, not Flask's default 5000: port 5000 is taken by another app on this PC.
    # Debug mode leaks stack traces, so it is opt-in: set FLASK_DEBUG=1 for local development.
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1", port=5001)
