import os
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough, RunnableParallel
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

    answer_chain = (
        {"context": retriever | format_docs, "question": RunnablePassthrough()}
        | prompt
        | llm
        | StrOutputParser()
    )

    # Возвращаем и ответ, и сами документы
    chain = RunnableParallel(
        answer=answer_chain,
        sources=retriever,
    )
    return chain


def print_result(result):
    # ---- Ответ ----
    print("\n" + "═" * 70)
    print("  ОТВЕТ")
    print("═" * 70)
    print(result["answer"])

    # ---- Источники ----
    print("\n" + "═" * 70)
    print(f"  ИСТОЧНИКИ (найдено: {len(result['sources'])})")
    print("═" * 70)

    for i, doc in enumerate(result["sources"], 1):
        m = doc.metadata
        print(f"\n[{i}] {m.get('name', '?')}")
        print(f"    Путь:            {m.get('path', '?')}")
        print(f"    Уровень:         {m.get('level', '?')}")
        print(f"    ID узла:         {m.get('id', '—')}")

        # description_category_id самого узла (или ближайшей категории)
        cat = m.get("category_id")
        parent_cat = m.get("parent_category_id")
        grand_cat = m.get("grandparent_category_id")

        print(f"    Категория (desc): {cat if cat is not None else '—'}")
        print(f"    Родитель (desc):  {parent_cat if parent_cat is not None else '—'}")
        print(f"    Уровень выше:     {grand_cat if grand_cat is not None else '—'}")

        print("    " + "─" * 60)


if __name__ == "__main__":
    chain = get_chain()
    result = chain.invoke("Найди категорию для фильмов")
    print_result(result)