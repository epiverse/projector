export async function request(text, key, model="models/text-embedding-004") {
  const url = `https://generativelanguage.googleapis.com/v1beta/${model}:embedContent?key=${key}`

  if (key == null) {
    throw Error("No Gemini API key supplied.");
  } 
  
  const result = await fetch(url, {
    method:'POST',
    headers:{
      'Content-Type': 'application/json',
    },
    body:JSON.stringify(embeddingRequest(text))
  })

  return await result.json()
}

function embeddingRequest(text, model="models/text-embedding-004") {
  return {
    model,
    content: {
      parts: [ { text }]
    }
  }
}