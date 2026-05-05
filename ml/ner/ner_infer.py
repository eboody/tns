#!/usr/bin/env python3
import json
import math
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent / 'site'
if str(SITE) not in sys.path:
    sys.path.insert(0, str(SITE))

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

ID2LABEL = {
    0: 'O',
    1: 'B-MISC',
    2: 'I-MISC',
    3: 'B-PER',
    4: 'I-PER',
    5: 'B-ORG',
    6: 'I-ORG',
    7: 'B-LOC',
    8: 'I-LOC',
}
LABEL_MAPPINGS = {
    'B-PER': 'Person',
    'I-PER': 'Person',
    'B-ORG': 'Organization',
    'I-ORG': 'Organization',
    'B-LOC': 'Location',
    'I-LOC': 'Location',
    'B-DATE': 'DateTime',
    'I-DATE': 'DateTime',
    'B-TIME': 'DateTime',
    'I-TIME': 'DateTime',
}


def softmax(logits):
    m = max(logits)
    exps = [math.exp(x - m) for x in logits]
    total = sum(exps)
    return [x / total for x in exps]


def parse_bio(predictions, probabilities, offsets, text, min_confidence=0.7):
    results = []
    current = None
    for idx, (pred_id, prob) in enumerate(zip(predictions, probabilities)):
        if offsets[idx] == (0, 0):
            continue
        label = ID2LABEL.get(pred_id, 'O')
        if label.startswith('B-'):
            if current is not None:
                entity_type, start, end, probs = current
                avg = sum(probs) / len(probs)
                if avg >= min_confidence:
                    results.append({
                        'entity_type': entity_type,
                        'start': start,
                        'end': end,
                        'score': avg,
                        'text': text[start:end],
                    })
            entity_type = LABEL_MAPPINGS.get(label)
            if entity_type is not None:
                current = (entity_type, offsets[idx][0], offsets[idx][1], [prob])
            else:
                current = None
        elif label.startswith('I-') and current is not None:
            entity_type, start, end, probs = current
            mapped = LABEL_MAPPINGS.get(label)
            if mapped == entity_type:
                current = (entity_type, start, offsets[idx][1], probs + [prob])
            else:
                avg = sum(probs) / len(probs)
                if avg >= min_confidence:
                    results.append({
                        'entity_type': entity_type,
                        'start': start,
                        'end': end,
                        'score': avg,
                        'text': text[start:end],
                    })
                current = None
        else:
            if current is not None:
                entity_type, start, end, probs = current
                avg = sum(probs) / len(probs)
                if avg >= min_confidence:
                    results.append({
                        'entity_type': entity_type,
                        'start': start,
                        'end': end,
                        'score': avg,
                        'text': text[start:end],
                    })
                current = None
    if current is not None:
        entity_type, start, end, probs = current
        avg = sum(probs) / len(probs)
        if avg >= min_confidence:
            results.append({
                'entity_type': entity_type,
                'start': start,
                'end': end,
                'score': avg,
                'text': text[start:end],
            })
    return results


def main():
    payload = json.load(sys.stdin)
    model_path = payload['model_path']
    tokenizer_path = payload['tokenizer_path']
    text = payload['text']
    min_confidence = payload.get('min_confidence', 0.7)

    tok = Tokenizer.from_file(tokenizer_path)
    enc = tok.encode(text)
    ids = enc.ids[:512]
    offsets = enc.offsets[:512]
    attention_mask = enc.attention_mask[:512]

    while len(ids) < 512:
        ids.append(0)
        attention_mask.append(0)
        offsets.append((0, 0))

    input_ids = np.array([ids], dtype=np.int64)
    attention_mask = np.array([attention_mask], dtype=np.int64)
    sess = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
    feeds = {'input_ids': input_ids, 'attention_mask': attention_mask}
    input_names = [i.name for i in sess.get_inputs()]
    if 'token_type_ids' in input_names:
        feeds['token_type_ids'] = np.zeros_like(input_ids)
    logits = sess.run(None, feeds)[0][0]

    predictions = []
    probabilities = []
    for token_logits in logits:
        probs = softmax(token_logits.tolist())
        pred_id = max(range(len(probs)), key=lambda i: probs[i])
        predictions.append(pred_id)
        probabilities.append(probs[pred_id])

    results = parse_bio(predictions, probabilities, offsets, text, min_confidence)
    json.dump({'results': results}, sys.stdout)

if __name__ == '__main__':
    main()
