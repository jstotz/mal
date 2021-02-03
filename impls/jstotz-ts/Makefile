STEP_SOURCES := $(shell ls src/step*.ts)

all: ts

node_modules:
	npm install

build/step%.js: node_modules src/step%.ts
	./node_modules/.bin/tsc -p .

.PHONY: ts clean

ts: $(foreach s,$(STEP_SOURCES),build/$(s:src/%.ts=%).js)

clean:
	rm -f *.js
