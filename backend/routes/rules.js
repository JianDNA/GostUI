const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { Rule } = require('../models');

// 获取所有规则
router.get('/', auth, async (req, res) => {
  try {
    const rules = await Rule.findAll({
      where: { userId: req.user.id }
    });
    res.json(rules);
  } catch (error) {
    console.error('Get rules error:', error);
    res.status(500).json({ message: '获取规则列表失败' });
  }
});

// 创建规则
router.post('/', auth, async (req, res) => {
  try {
    const rule = await Rule.create({
      ...req.body,
      userId: req.user.id
    });
    res.status(201).json(rule);
  } catch (error) {
    console.error('Create rule error:', error);
    res.status(500).json({ message: '创建规则失败' });
  }
});

// 更新规则
router.put('/:id', auth, async (req, res) => {
  try {
    const rule = await Rule.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!rule) {
      return res.status(404).json({ message: '规则不存在' });
    }

    await rule.update(req.body);
    res.json(rule);
  } catch (error) {
    console.error('Update rule error:', error);
    res.status(500).json({ message: '更新规则失败' });
  }
});

// 删除规则
router.delete('/:id', auth, async (req, res) => {
  try {
    const rule = await Rule.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!rule) {
      return res.status(404).json({ message: '规则不存在' });
    }

    await rule.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Delete rule error:', error);
    res.status(500).json({ message: '删除规则失败' });
  }
});

module.exports = router; 