# Majhna osnovna slika za manjšo velikost in manjšo porabo virov
FROM python:3.12-alpine

WORKDIR /app

# Namestitev odvisnosti ločeno od kode -> boljše izkoriščanje Docker cache-a
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# gunicorn namesto Flask dev strežnika -> primerno za "produkcijski" zagon v kontejnerju
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "app:app"]
