# -*- coding: utf-8 -*-
"""
Modul za pošiljanje logov v RabbitMQ (skupni exchange "logs_exchange").
Vsaka mikrostoritev ima svojo instanco tega modula (isti vzorec, druga
SERVICE_NAME), kar zadosti zahtevi "vsaka mikrostoritev naj ima svoj
sistem beleženja".
"""

import os
import json
import datetime
import pika

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://gostilna:gostilnapass@rabbitmq:5672")
EXCHANGE_NAME = os.environ.get("EXCHANGE_NAME", "logs_exchange")
SERVICE_NAME = os.environ.get("SERVICE_NAME", "login-register-service")


def publish_log(level, url, correlation_id, message):
    """Objavi log sporočilo v RabbitMQ. Napaka pri pošiljanju NE sme
    prekiniti glavne poslovne logike -> v najslabšem primeru se izpiše
    samo na stdout kontejnerja."""
    entry = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "level": level,
        "url": url,
        "correlationId": correlation_id,
        "service": SERVICE_NAME,
        "message": message,
    }
    routing_key = f"log.{SERVICE_NAME}"
    try:
        params = pika.URLParameters(RABBITMQ_URL)
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        channel.exchange_declare(exchange=EXCHANGE_NAME, exchange_type="topic", durable=True)
        channel.basic_publish(
            exchange=EXCHANGE_NAME,
            routing_key=routing_key,
            body=json.dumps(entry),
            properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
        )
        connection.close()
    except Exception as e:  # noqa: BLE001
        print(f"[{SERVICE_NAME}] Napaka pri pošiljanju loga v RabbitMQ: {e}")