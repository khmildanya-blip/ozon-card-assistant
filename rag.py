import os
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

DB_DIR = "./chroma_db"
COLLECTION = "ozon_categories"


def format_docs(docs):
    return "\n\n---\n\n".join(
        f"{d.page_content}\n(источник: {d.metadata.get('path', '?')})"
        for d in docs
    )


def get_chain():
    embeddings = HuggingFaceEmbeddings(model_name="intfloat/multilingual-e5-base")
    db = Chroma(
        persist_directory=DB_DIR,
        embedding_function=embeddings,
        collection_name=COLLECTION,
    )
    retriever = db.as_retriever(search_kwargs={"k": 4})

    prompt = ChatPromptTemplate.from_template(
        "Ты помощник по категориям Ozon. Отвечай, опираясь только на контекст.\n"
        "Если ответа в контексте нет — честно скажи об этом.\n\n"
        "Контекст:\n{context}\n\n"
        "Вопрос: {question}"
    )

    llm = ChatOllama(model="qwen2.5:7b", temperature=0)

    chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )
    return chain


if __name__ == "__main__":
    chain = get_chain()
    answer = chain.invoke("Найди категорию для шампуней")
    print(answer)