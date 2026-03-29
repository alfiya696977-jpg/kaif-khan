import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const SYSTEM_INSTRUCTION = `
You are the intelligent teaching engine of an AI platform called "AutoMentor AI".
You DO NOT give full answers at once. You operate in a STEP-BY-STEP, INTERACTIVE, DYNAMIC teaching mode.

🎯 YOUR RESPONSIBILITIES:

1. action = "analyze"
Return structured plan ONLY:
{ "summary": "short summary", "topics": [{ "id": 0, "title": "..." }], "difficulty": "easy | medium | hard", "message": "Ready to start learning" }

2. action = "teach"
Teach FIRST topic:
{ "topic_id": 0, "title": "...", "explanation": "2–3 line explanation", "example": "simple example", "question": "ask a simple question", "next_action": "wait_for_answer" }

3. action = "next"
* Move to next topic ONLY
* Return same format as "teach"

4. action = "evaluate"
* Check student answer
If correct: { "result": "correct", "message": "Good job! Moving ahead.", "next_action": "next" }
If wrong: { "result": "incorrect", "message": "Let's simplify this.", "hint": "simpler explanation", "next_action": "retry" }
If ambiguous: { "result": "ambiguous", "message": "I'm not sure I understand. Could you clarify...?", "next_action": "clarify" }
* In voice mode, ALWAYS prefer asking a clarifying question if the input is not a clear answer.

5. action = "quiz"
Return: { "quiz": [{ "question": "...", "options": ["A","B","C","D"], "answer": "A" }] }

6. action = "voice_teach"
You are a voice-based AI teacher.
You MUST teach in a VERY SLOW, LINE-BY-LINE manner.

🚨 STRICT RULES (DO NOT BREAK):
* Output ONLY ONE SHORT LINE at a time
* Each response must contain ONLY ONE sentence
* Maximum 8–12 words per response
* After each line, STOP and wait

🎯 TEACHING STYLE:
* Speak like a real teacher talking slowly
* Break explanation into very small parts
* Do NOT combine sentences
* Do NOT give paragraphs

🎯 OUTPUT FORMAT:
{ "line": "single short sentence", "next": "wait" }

🎯 FLOW:
1. First explain a tiny part
2. Stop
3. Wait for "next"
4. Continue next small part

🎤 VOICE OPTIMIZATION:
* Sentences must sound natural when spoken
* No complex words
* No long sentences

❌ NEVER DO:
* Do NOT give multiple sentences
* Do NOT give paragraphs
* Do NOT explain everything at once

7. action = "monitor_focus"
You are an AI attention monitoring system.
Analyze student focus data from camera detection.
🎯 INPUT: { "face_detected": bool, "focus_score": 0-100, "duration_low_focus": seconds }
🎯 LOGIC:
* If face_detected = true: focus is improving
* If face_detected = false: focus is decreasing
* LOW FOCUS (score < 40 OR duration > 5s): { "status": "low_focus", "action": "alert", "message": "Your focus is low. Please concentrate.", "voice": "Your focus is low. Please concentrate." }
* GOOD FOCUS (score >= 40): { "status": "focused", "action": "none", "message": "You are doing well. Keep going." }
* CRITICAL (score < 20 AND duration > 10s): { "status": "critical", "action": "parent_alert", "message": "Student is highly distracted.", "voice": "You are not paying attention. Please focus immediately." }
🎯 RULES:
* Return clean JSON only.
* Voice messages must be short and direct.

🎤 VOICE OPTIMIZATION (GENERAL)
All responses must be:
* Short sentences
* Natural spoken tone
* Easy to read aloud
Example style: "Let’s start with a simple concept. A matrix is just a table of numbers."

⚠️ STRICT RULES
* NEVER return full lecture
* NEVER overload with information
* ALWAYS guide step-by-step
* ALWAYS wait for next action

🎯 DATABASE-READY FORMAT
Always include:
{
  "user_id": "...",
  "timestamp": "auto",
  "data": { actual response }
}
`;

export async function analyzeContent(content: string, userId: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify({
      user_id: userId,
      action: "analyze",
      content: content
    }),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          user_id: { type: Type.STRING },
          timestamp: { type: Type.STRING },
          data: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              difficulty: { type: Type.STRING, enum: ["easy", "medium", "hard"] },
              topics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    title: { type: Type.STRING }
                  },
                  required: ["id", "title"]
                }
              },
              message: { type: Type.STRING }
            },
            required: ["summary", "topics", "message"]
          }
        },
        required: ["user_id", "timestamp", "data"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}

export async function teachTopic(content: string, userId: string, topicId: number, action: "teach" | "next" = "teach") {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify({
      user_id: userId,
      action: action,
      content: content,
      current_topic_index: topicId
    }),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          user_id: { type: Type.STRING },
          timestamp: { type: Type.STRING },
          data: {
            type: Type.OBJECT,
            properties: {
              topic_id: { type: Type.INTEGER },
              title: { type: Type.STRING },
              explanation: { type: Type.STRING },
              example: { type: Type.STRING },
              question: { type: Type.STRING },
              next_action: { type: Type.STRING }
            },
            required: ["topic_id", "title", "explanation", "example", "question", "next_action"]
          }
        },
        required: ["user_id", "timestamp", "data"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}

export async function evaluateAnswer(content: string, userId: string, topicId: number, studentAnswer: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify({
      user_id: userId,
      action: "evaluate",
      content: content,
      current_topic_index: topicId,
      student_answer: studentAnswer
    }),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          user_id: { type: Type.STRING },
          timestamp: { type: Type.STRING },
          data: {
            type: Type.OBJECT,
            properties: {
              result: { type: Type.STRING, enum: ["correct", "incorrect", "ambiguous"] },
              message: { type: Type.STRING },
              hint: { type: Type.STRING },
              next_action: { type: Type.STRING }
            },
            required: ["result", "message", "next_action"]
          }
        },
        required: ["user_id", "timestamp", "data"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}

export async function evaluateAnswers(quiz: any, studentAnswers: string[], userId: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify({
      user_id: userId,
      action: "evaluate_quiz",
      content: JSON.stringify(quiz),
      student_answer: JSON.stringify(studentAnswers)
    }),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          user_id: { type: Type.STRING },
          timestamp: { type: Type.STRING },
          data: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              weak_topics: { type: Type.ARRAY, items: { type: Type.STRING } },
              feedback: { type: Type.STRING }
            },
            required: ["score", "weak_topics", "feedback"]
          }
        },
        required: ["user_id", "timestamp", "data"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}

export async function generateQuiz(content: string, userId: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify({
      user_id: userId,
      action: "quiz",
      content: content
    }),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          user_id: { type: Type.STRING },
          timestamp: { type: Type.STRING },
          data: {
            type: Type.OBJECT,
            properties: {
              quiz: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    answer: { type: Type.STRING }
                  },
                  required: ["question", "options", "answer"]
                }
              }
            },
            required: ["quiz"]
          }
        },
        required: ["user_id", "timestamp", "data"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}

export async function voiceTeach(content: string, userId: string, topicId: number, lastLine?: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify({
      user_id: userId,
      action: "voice_teach",
      content: content,
      current_topic_index: topicId,
      last_line_taught: lastLine
    }),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          user_id: { type: Type.STRING },
          timestamp: { type: Type.STRING },
          data: {
            type: Type.OBJECT,
            properties: {
              line: { type: Type.STRING },
              next: { type: Type.STRING }
            },
            required: ["line", "next"]
          }
        },
        required: ["user_id", "timestamp", "data"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}

export async function generalChat(message: string, userId: string, history: any[] = []) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify({
      user_id: userId,
      action: "chat",
      content: message,
      history: history
    }),
    config: {
      systemInstruction: "You are the 'AutoMentor AI' assistant. You are a friendly, intelligent, and helpful mentor. You can answer questions about learning, provide study tips, and help students navigate their library. Keep responses concise and encouraging. Return JSON in the format: { \"user_id\": \"...\", \"timestamp\": \"auto\", \"data\": { \"response\": \"...\" } }",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          user_id: { type: Type.STRING },
          timestamp: { type: Type.STRING },
          data: {
            type: Type.OBJECT,
            properties: {
              response: { type: Type.STRING }
            },
            required: ["response"]
          }
        },
        required: ["user_id", "timestamp", "data"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}

export async function monitorFocus(faceDetected: boolean, focusScore: number, durationLowFocus: number) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: JSON.stringify({
      action: "monitor_focus",
      face_detected: faceDetected,
      focus_score: focusScore,
      duration_low_focus: durationLowFocus
    }),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING },
          action: { type: Type.STRING },
          message: { type: Type.STRING },
          voice: { type: Type.STRING }
        },
        required: ["status", "action", "message"]
      }
    }
  });
  return JSON.parse(response.text || "{}");
}
