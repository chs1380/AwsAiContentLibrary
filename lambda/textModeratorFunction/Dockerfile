ARG FUNCTION_DIR="/function"

FROM python:3.9.12-buster as build-image


# Include global arg in this stage of the build
ARG FUNCTION_DIR

# Install aws-lambda-cpp build dependencies
RUN apt-get update && \
    apt-get install -y \
    g++ \
    make \
    cmake \
    unzip \
    libcurl4-openssl-dev

# Create function directory
RUN mkdir -p ${FUNCTION_DIR}

# Install the function's dependencies
RUN pip uninstall --yes jupyter
RUN pip install --target ${FUNCTION_DIR} awslambdaric boto3 sagemaker scipy alt-profanity-check

# Copy common.py
COPY common.py ${FUNCTION_DIR}

FROM python:3.9.12-buster

# Include global arg in this stage of the build
ARG FUNCTION_DIR
# Set working directory to function root directory
WORKDIR ${FUNCTION_DIR}

# Copy in the built dependencies
COPY --from=build-image ${FUNCTION_DIR} ${FUNCTION_DIR}
# Copy handler function
COPY index.py ${FUNCTION_DIR}
ENV PYTHONIOENCODING utf-8
ENTRYPOINT ["python3", "-m", "awslambdaric" ]

# This will get replaced by the proper handler by the CDK script
CMD [ "index.lambda_handler" ]