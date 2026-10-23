import assert from "node:assert/strict";
import { parseAiStudyChatSuggestions } from "../src/lib/ai-study-chat-suggestions";

const answer = (question: string) => JSON.stringify({ question });

assert.deepEqual(parseAiStudyChatSuggestions([
  answer("边际效用递减怎样影响消费者的选择？"),
  answer("边际效用和总效用变化有什么不同？")
]), [
  "边际效用递减怎样影响消费者的选择？",
  "边际效用和总效用变化有什么不同？"
]);

assert.deepEqual(parseAiStudyChatSuggestions([
  answer("边际效用递减怎样影响消费者的选择？"),
  answer("用原文依据：第137—142页举个具体例子？")
]), []);
assert.deepEqual(parseAiStudyChatSuggestions([answer("重复的问题是什么？"), answer("重复的问题是什么？")]), []);
assert.deepEqual(parseAiStudyChatSuggestions(["not JSON", answer("边际效用和总效用有何不同？")]), []);
assert.deepEqual(parseAiStudyChatSuggestions([answer("只有一个问题？")]), []);
assert.deepEqual(parseAiStudyChatSuggestions([answer("这个知识点的核心原理是什么？"), answer("边际效用和总效用有何不同？")]), []);

console.log("ai-study chat suggestion tests passed");
