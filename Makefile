.PHONY: sbs sps

sbs:
	ssh -i lightsail-key.pem ubuntu@56.125.158.204

sps:
	ssh -i lightsail-key.pem ubuntu@56.126.92.35
