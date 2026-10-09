import os
import razorpay

client = razorpay.Client(auth=("rzp_test_TlQ9tqRR6IYEJq", "xUZ20qyN2Bo30z4LK3kxejZA"))
try:
    order = client.order.create({
        "amount": 50000,
        "currency": "INR",
        "receipt": "receipt_1"
    })
    print(order)
except Exception as e:
    print("ERROR:", e)
