from transformers import BlipProcessor, BlipForConditionalGeneration, MarianMTModel, MarianTokenizer
from PIL import Image
import os
import re


class ImageRecognizerRU:
    def __init__(self):
        print("Загрузка моделей...")

        # BLIP для распознавания (загружается из интернета, проблемы с кириллицей нет)
        self.processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-large")
        self.model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-large")

        # Переводчик загружаем из ЛОКАЛЬНОЙ папки (решает проблему с кириллицей в пути)
        local_model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "local_translator")
        print(f"Загрузка переводчика из: {local_model_dir}")

        if not os.path.exists(local_model_dir):
            raise FileNotFoundError(
                f"Папка local_translator не найдена по пути:\n{local_model_dir}\n"
                "Убедитесь, что папка лежит рядом со скриптом recognizer.py"
            )

        self.translator_model = MarianMTModel.from_pretrained(local_model_dir)
        self.translator_tokenizer = MarianTokenizer.from_pretrained(local_model_dir)

        print("Модели загружены!")

    def translate(self, text):
        """Перевод текста с английского на русский"""
        inputs = self.translator_tokenizer(text, return_tensors="pt", padding=True)
        translated = self.translator_model.generate(**inputs)
        return self.translator_tokenizer.decode(translated[0], skip_special_tokens=True)

    def clean_caption(self, text):
        """Очистка описания от лишних слов с помощью регулярных выражений"""

        # 1. Убираем английские префиксы в начале строки
        text = re.sub(
            r'^(a photo of |a picture of |an image of |this is a photo of |it is a )',
            '', text, flags=re.IGNORECASE
        )

        # 2. Убираем конструкции типа "A person holding...", "A woman wearing..."
        text = re.sub(
            r'^(a|an|the)\s+(person|woman|man|child|boy|girl|people|someone|lady|guy)\s+'
            r'(holding|wearing|using|carrying|showing|displaying|presenting)\s+(a|an|the|pair of|pairs of)\s+',
            '', text, flags=re.IGNORECASE
        )

        # 3. Убираем русские префиксы
        text = re.sub(
            r'^(фото |изображение |картинка |это фото |это изображение )',
            '', text, flags=re.IGNORECASE
        )

        # 4. Убираем русские конструкции типа "Человек, держащий..."
        text = re.sub(
            r'^(человек|женщина|мужчина|ребёнок|мальчик|девочка|люди|кто-то|девушка|парень)\s*,?\s*'
            r'(держащий|держащая|держащее|носящий|носящая|использующий|использующая|показывающий|показывающая)\s+',
            '', text, flags=re.IGNORECASE
        )

        # 5. Убираем описание окружения в конце (английский)
        text = re.sub(
            r'\s*(on|in|at|against|near|by|next to|in front of|behind)\s+'
            r'(a|an|the|some|this|that)\s+'
            r'(wooden|metal|glass|plastic|white|black|brown|red|blue|green|yellow|gray|grey|dark|light|large|small|big|old|new|modern|vintage|rustic|clean|dirty|messy|empty|crowded|bright|dim|sunny|shady)?\s*'
            r'(table|desk|chair|sofa|couch|bed|floor|ground|wall|shelf|counter|surface|room|kitchen|bathroom|bedroom|office|store|shop|street|garden|park|beach|pool|window|door|background|setting|scene|environment|area|place|spot|location)?\.?$',
            '', text, flags=re.IGNORECASE
        )

        # 6. Убираем описание окружения (русский)
        text = re.sub(
            r'\s*(на|в|у|около|возле|рядом с|перед|за|на фоне)\s+'
            r'(деревянном|металлическом|стеклянном|пластиковом|белом|чёрном|черном|коричневом|красном|синем|зелёном|зеленом|жёлтом|желтом|сером|тёмном|темном|светлом|большом|маленьком|старом|новом|современном|чистом|грязном|пустом)?\s*'
            r'(столе|стуле|диване|кровати|полу|земле|стене|полке|прилавке|поверхности|комнате|кухне|ванной|спальне|офисе|магазине|улице|саду|парке|пляже|бассейне|окне|двери|фоне|месте)?\.?$',
            '', text, flags=re.IGNORECASE
        )

        # Убираем лишние пробелы и точки в конце
        text = text.strip().rstrip('.')

        # Делаем первую букву заглавной
        if text:
            text = text[0].upper() + text[1:]

        return text

    def recognize(self, image_path):
        """Распознавание изображения с фокусом на основном объекте"""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Файл не найден: {image_path}")

        image = Image.open(image_path).convert("RGB")

        # Промпт "a photo of" фокусирует модель на объекте, а не на сцене
        inputs = self.processor(image, text="a photo of", return_tensors="pt")

        # Beam search для более точного результата (избегает обрезки слов типа dumbbell)
        out = self.model.generate(
            **inputs,
            max_length=100,
            num_beams=5,
            no_repeat_ngram_size=2,
            early_stopping=True
        )
        caption_en = self.processor.decode(out[0], skip_special_tokens=True)

        # Очищаем от "a photo of" и подобных префиксов
        caption_en_clean = self.clean_caption(caption_en)

        # Переводим на русский
        caption_ru = self.translate(caption_en_clean)

        # Очищаем и русский вариант
        caption_ru_clean = self.clean_caption(caption_ru)

        return caption_en_clean, caption_ru_clean


if __name__ == "__main__":
    recognizer = ImageRecognizerRU()

    image_path = 'img.png'

    if not image_path:
        print("Путь не указан!")
        exit()

    print(f"\nРаспознаю: {image_path}")
    caption_en, caption_ru = recognizer.recognize(image_path)

    print(f"\nEnglish: {caption_en}")
    print(f"Русский: {caption_ru}")
